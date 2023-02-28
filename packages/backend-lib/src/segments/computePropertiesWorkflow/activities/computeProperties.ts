import { Row } from "@clickhouse/client";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import jp from "jsonpath";
import { err, ok, Result } from "neverthrow";

import { clickhouseClient } from "../../../clickhouse";
import { getSubscribedSegments } from "../../../journeys";
import {
  segmentUpdateSignal,
  userJourneyWorkflow,
} from "../../../journeys/userWorkflow";
import prisma from "../../../prisma";
import { findAllEnrichedSegments } from "../../../segments";
import { getContext } from "../../../temporal/activity";
import {
  ComputedAssignment,
  EnrichedJourney,
  EnrichedSegment,
  EnrichedUserProperty,
  // SegmentHasBeenOperatorComparator,
  SegmentNode,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentUpdate,
  UserPropertyDefinitionType,
} from "../../../types";

interface BaseComputedProperty {
  modelIndex: number;
}
interface SegmentComputedProperty extends BaseComputedProperty {
  type: "Segment";
  segment: EnrichedSegment;
}

interface UserComputedProperty extends BaseComputedProperty {
  type: "UserProperty";
  userProperty: EnrichedUserProperty;
}

type ComputedProperty = SegmentComputedProperty | UserComputedProperty;

function pathToArgs(path: string): string {
  return jp
    .parse(path)
    .map((c) => `'${c.expression.value}'`)
    .join(", ");
}

function buildSegmentQueryExpression({
  currentTime,
  node,
  nodes,
}: {
  currentTime: number;
  node: SegmentNode;
  nodes: SegmentNode[];
}): string {
  switch (node.type) {
    case SegmentNodeType.Trait: {
      const pathArgs = pathToArgs(node.path);

      switch (node.operator.type) {
        case SegmentOperatorType.Equals: {
          const val = node.operator.value;
          let queryVal: string;

          switch (typeof val) {
            case "number": {
              queryVal = String(val);
              break;
            }
            case "string": {
              queryVal = `'${val}'`;
              break;
            }
          }

          return `
            JSON_VALUE(
              (
                arrayFilter(
                  m -> JSONHas(m.1, 'traits', ${pathArgs}),
                  timed_messages
                )
              )[1].1,
              '$.traits.${node.path}'
            ) == ${queryVal}
          `;
        }
        case SegmentOperatorType.HasBeen: {
          return "True";
          // if (
          //   node.operator.comparator !== SegmentHasBeenOperatorComparator.GTE
          // ) {
          //   throw new Error("Unimplemented comparator.");
          // }

          // const val = node.operator.value;
          // const varName = `last_trait_update${node.id.replace(/-/g, "_")}`;
          // const upperTraitBound =
          //   currentTime / 1000 - node.operator.windowSeconds;

          // console.log(
          //   "upperTraitBound",
          //   new Date(upperTraitBound * 1000).toISOString()
          // );

          // let queryVal: string;

          // switch (typeof val) {
          //   case "number": {
          //     queryVal = String(val);
          //     break;
          //   }
          //   case "string": {
          //     queryVal = `'${val}'`;
          //     break;
          //   }
          // }

          // return `
          //     JSON_VALUE(
          //       (
          //         arrayFirst(
          //           m -> JSONHas(m.1, 'traits', ${pathArgs}),
          //           timed_messages
          //         ) as ${varName}
          //       ).1,
          //       '$.traits.${node.path}'
          //     ) == ${queryVal}
          //   `;

          // FIXME test if has no relevant events shouldn't error
          // return `
          //   and(
          //     JSON_VALUE(
          //       (
          //         arrayFirst(
          //           m -> JSONHas(m.1, 'traits', ${pathArgs}),
          //           timed_messages
          //         ) as ${varName}
          //       ).1,
          //       '$.traits.${node.path}'
          //     ) == ${queryVal},
          //     ${varName}.2 < toDateTime64(${upperTraitBound}, 3)
          //   )`;

          // ${varName}.2 < toDateTime64(${upperTraitBound}, 3)
        }
        case SegmentOperatorType.Within: {
          const upperTraitBound = currentTime / 1000;
          const traitIdentifier = node.id.replace(/-/g, "_");

          const lowerTraitBound =
            currentTime / 1000 - node.operator.windowSeconds;

          // FIXME replace array find with array first
          return `
            and(
              (
                parseDateTime64BestEffortOrNull(
                  JSON_VALUE(
                    arrayFilter(
                      m -> JSONHas(m.1, 'traits', ${pathArgs}),
                      timed_messages
                    )[1].1,
                    '$.traits.${node.path}'
                  )
                ) as trait_time${traitIdentifier}
              ) > toDateTime64(${lowerTraitBound}, 3),
              trait_time${traitIdentifier} < toDateTime64(${upperTraitBound}, 3)
            )`;
        }
      }
      break;
    }
    case SegmentNodeType.And: {
      const childIds = new Set(node.children);
      const childNodes = nodes.filter((n) => childIds.has(n.id));
      const childFragments = childNodes.map((childNode) =>
        buildSegmentQueryExpression({
          currentTime,
          node: childNode,
          nodes,
        })
      );
      return `and(
        ${childFragments.join(", ")}
      )`;
    }
    case SegmentNodeType.Or: {
      const childIds = new Set(node.children);
      const childNodes = nodes.filter((n) => childIds.has(n.id));
      const childFragments = childNodes.map((childNode) =>
        buildSegmentQueryExpression({
          currentTime,
          node: childNode,
          nodes,
        })
      );
      return `or(
        ${childFragments.join(", ")}
      )`;
    }
  }
}

function buildSegmentQueryFragment({
  currentTime,
  modelIndex,
  segment,
}: {
  currentTime: number;
  modelIndex: number;
  segment: EnrichedSegment;
}): string {
  return `
    (
      ${modelIndex},
      ${buildSegmentQueryExpression({
        currentTime,
        node: segment.definition.entryNode,
        nodes: segment.definition.nodes,
      })},
      Null,
      '${segment.id}'
    )
  `;
}

function buildUserPropertyQueryFragment({
  modelIndex,
  userProperty,
}: {
  modelIndex: number;
  userProperty: EnrichedUserProperty;
}): string {
  let innerQuery: string;
  switch (userProperty.definition.type) {
    case UserPropertyDefinitionType.Trait: {
      const { path } = userProperty.definition;
      const pathArgs = pathToArgs(path);

      innerQuery = `
          JSON_VALUE(
            (
              arraySort(
                m -> -toInt64(m.2),
                arrayFilter(
                  m -> JSONHas(m.1, 'traits', ${pathArgs}),
                  timed_messages
                )
              ) as m${modelIndex}
            )[1].1,
            '$.traits.${path}'
          )
      `;
      break;
    }
    case UserPropertyDefinitionType.Id: {
      innerQuery = "user_id";
      break;
    }
    case UserPropertyDefinitionType.AnonymousId: {
      innerQuery = "any(anonymous_id)";
      break;
    }
  }
  return `
    (
      ${modelIndex},
      Null,
      ${innerQuery},
      '${userProperty.id}'
    )
  `;
}

function computedToQueryFragments({
  computedProperties,
  currentTime,
}: {
  computedProperties: ComputedProperty[];
  currentTime: number;
}): Map<string, string> {
  const withClause = new Map<string, string>();
  const modelFragments: string[] = [];

  for (const computedProperty of computedProperties) {
    switch (computedProperty.type) {
      case "UserProperty": {
        modelFragments.push(
          buildUserPropertyQueryFragment({
            userProperty: computedProperty.userProperty,
            modelIndex: computedProperty.modelIndex,
          })
        );
        break;
      }
      case "Segment": {
        modelFragments.push(
          buildSegmentQueryFragment({
            segment: computedProperty.segment,
            modelIndex: computedProperty.modelIndex,
            currentTime,
          })
        );
      }
    }
  }

  withClause.set(
    "timed_messages",
    `
      arraySort(
        m -> -toInt64(m.2),
        arrayZip(
          groupArray(message_raw),
          groupArray(event_time),
          groupArray(processing_time)
        )
      )
    `
  );
  const joinedModelsFragment = `
    arrayJoin(
        [
          ${modelFragments.join(",\n")}
        ]
    )
  `;
  withClause.set("models", joinedModelsFragment);
  withClause.set("model_index", "models.1");
  withClause.set("in_segment", "models.2");
  withClause.set("user_property", "models.3");
  withClause.set("computed_property_id", "models.4");
  withClause.set(
    "latest_processing_time",
    "arrayMax(m -> toInt64(m.3), timed_messages)"
  );
  withClause.set("history_length", "length(timed_messages)");

  return withClause;
}

async function signalJourney({
  segmentId,
  workspaceId,
  segmentAssignment,
  journey,
}: {
  segmentId: string;
  workspaceId: string;
  segmentAssignment: ComputedAssignment;
  journey: EnrichedJourney;
}) {
  const { _assigned_at: assignedAt } = segmentAssignment;

  const segmentUpdate = {
    segmentId,
    currentlyInSegment: Boolean(segmentAssignment.latest_segment_value),
    segmentVersion: new Date(assignedAt).getTime(),
  };

  if (segmentUpdate.currentlyInSegment) {
    const { workflowClient } = getContext();
    const workflowId = `user-journey-${journey.id}-${segmentAssignment.user_id}`;

    const userId = segmentAssignment.user_id;
    await workflowClient.signalWithStart<
      typeof userJourneyWorkflow,
      [SegmentUpdate]
    >(userJourneyWorkflow, {
      taskQueue: "default",
      workflowId,
      args: [
        {
          journeyId: journey.id,
          definition: journey.definition,
          workspaceId,
          userId,
        },
      ],
      signal: segmentUpdateSignal,
      signalArgs: [segmentUpdate],
    });
  }
}

// TODO distinguish between recoverable and non recoverable errors
// TODO signal back to workflow with query id, so that query can be safely restarted part way through
export async function computePropertiesPeriodSafe({
  currentTime,
  subscribedJourneys,
  tableVersion,
  workspaceId,
  userProperties,
}: ComputePropertiesPeriodParams): Promise<Result<null, Error>> {
  const segmentResult = await findAllEnrichedSegments(workspaceId);

  if (segmentResult.isErr()) {
    return err(new Error(JSON.stringify(segmentResult.error)));
  }

  const segments = segmentResult.value;
  // const modelIds: string[] = segments
  //   .map((s) => s.id)
  //   .concat(userProperties.map((up) => up.id));

  const segmentComputedProperties: ComputedProperty[] = segments.map(
    (segment, i) => {
      const p: SegmentComputedProperty = {
        type: "Segment",
        segment,
        modelIndex: i,
      };
      return p;
    }
  );

  const userComputedProperties: ComputedProperty[] = userProperties.map(
    (userProperty, i) => {
      const p: UserComputedProperty = {
        type: "UserProperty",
        userProperty,
        modelIndex: i + segments.length,
      };
      return p;
    }
  );

  const withClause = computedToQueryFragments({
    currentTime,
    computedProperties: segmentComputedProperties.concat(
      userComputedProperties
    ),
  });

  // TODO handle anonymous id's, including case where user_id is null
  // TODO handle materializing previous segmentation result by writing query to table
  const lowerBoundClause = "";
  // processingTimeLowerBound && !Object.keys(newComputedIds ?? {}).length
  //   ? `HAVING latest_processing_time >= toDateTime64(${
  //       processingTimeLowerBound / 1000
  //     }, 3)`
  //   : "";

  const joinedWithClause = Array.from(withClause)
    .map(([key, value]) => `${value} AS ${key}`)
    .join(",\n");

  const writeQuery = `
    INSERT INTO computed_property_assignments
    SELECT
      '${workspaceId}',
      sas.user_id,
      if(isNull(in_segment), 1, 2),
      sas.computed_property_id,
      coalesce(sas.in_segment, False),
      coalesce(sas.user_property, ''),
      False,
      now64(3)
    FROM (
      SELECT 
        ${joinedWithClause},
        user_id,
        history_length,
        model_index,
        in_segment,
        user_property,
        latest_processing_time,
        timed_messages
      FROM user_events_${tableVersion}
      WHERE workspace_id == '${workspaceId}' AND isNotNull(user_id)
      GROUP BY user_id
      ${lowerBoundClause}
      ORDER BY latest_processing_time DESC
    ) sas
  `;

  const readQuery = `
    WITH
        uniq(segment_value) AS segment_value_count,
        uniq(user_property_value) AS user_property_value_count,
        uniq(processed) AS processed_count
    SELECT computed_property_id,
        user_id,
        type,
        argMax(segment_value, assigned_at) latest_segment_value,
        argMax(user_property_value, assigned_at) latest_user_property_value,
        max(assigned_at) _assigned_at
    FROM computed_property_assignments FINAL
    WHERE workspace_id == '${workspaceId}'
    GROUP BY workspace_id,
        type,
        computed_property_id,
        user_id
    HAVING segment_value_count == processed_count 
      OR user_property_value_count == processed_count;
  `;

  await clickhouseClient().query({
    query: writeQuery,
    format: "JSONEachRow",
  });

  const resultSet = await clickhouseClient().query({
    query: readQuery,
    format: "JSONEachRow",
  });

  // let lastProcessingTime: null | number = null;

  for await (const rows of resultSet.stream()) {
    const assignments: ComputedAssignment[] = await Promise.all(
      rows.flatMap(async (row: Row) => {
        const json = await row.json();
        const result = schemaValidate(json, ComputedAssignment);
        if (result.isErr()) {
          console.error(
            `failed to parse assignment json: ${JSON.stringify(
              json
            )} error: ${JSON.stringify(result.error)}`
          );
          return [];
        }
        return result.value;
      })
    );

    const userPropertyAssignments: ComputedAssignment[] = [];
    const segmentAssignments: ComputedAssignment[] = [];

    for (const assignment of assignments) {
      switch (assignment.type) {
        case "segment":
          segmentAssignments.push(assignment);
          break;
        case "user_property":
          userPropertyAssignments.push(assignment);
          break;
      }
    }
    console.log(assignments);
    await Promise.all([
      ...userPropertyAssignments.map((a) =>
        prisma.userPropertyAssignment.upsert({
          where: {
            workspaceId_userPropertyId_userId: {
              workspaceId,
              userId: a.user_id,
              userPropertyId: a.computed_property_id,
            },
          },
          update: {
            value: a.latest_user_property_value,
          },
          create: {
            workspaceId,
            userId: a.user_id,
            userPropertyId: a.computed_property_id,
            value: a.latest_user_property_value,
          },
        })
      ),
      ...segmentAssignments.map((a) => {
        const inSegment = Boolean(a.latest_segment_value);
        return prisma.segmentAssignment.upsert({
          where: {
            userId_segmentId: {
              userId: a.user_id,
              segmentId: a.computed_property_id,
            },
          },
          update: {
            inSegment,
          },
          create: {
            userId: a.user_id,
            segmentId: a.computed_property_id,
            inSegment,
          },
        });
      }),
    ]);

    const signalBatch: Promise<void>[] = [];
    for (const assignment of assignments) {
      // if (!lastProcessingTime) {
      //   lastProcessingTime = Number(assignment.latest_processing_time) * 1000;
      // }

      // const segmentId = modelIds[assignment.model_index];

      // if (!segmentId) {
      //   continue;
      // }

      for (const journey of subscribedJourneys) {
        // if (
        //   !newComputedIds?.[journey.id] &&
        //   processingTimeLowerBound &&
        //   // TODO move this logic into the query
        //   Number(assignment.latest_processing_time) * 1000 <
        //     processingTimeLowerBound
        // ) {
        //   continue;
        // }
        const subscribedSegments = getSubscribedSegments(journey.definition);
        if (!subscribedSegments.has(assignment.computed_property_id)) {
          continue;
        }
        signalBatch.push(
          signalJourney({
            workspaceId,
            segmentId: assignment.computed_property_id,
            segmentAssignment: assignment,
            journey,
          })
        );
      }
    }
    await Promise.all(signalBatch);
  }

  // return ok(lastProcessingTime);
  return ok(null);
}

interface ComputePropertiesPeriodParams {
  currentTime: number;
  newComputedIds?: Record<string, boolean>;
  subscribedJourneys: EnrichedJourney[];
  userProperties: EnrichedUserProperty[];
  processingTimeLowerBound?: number;
  workspaceId: string;
  tableVersion: string;
}

export async function computePropertiesPeriod(
  params: ComputePropertiesPeriodParams
): Promise<null> {
  return unwrap(await computePropertiesPeriodSafe(params));
}
