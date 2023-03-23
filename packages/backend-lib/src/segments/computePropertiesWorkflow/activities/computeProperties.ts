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
import logger from "../../../logger";
import prisma from "../../../prisma";
import { findAllEnrichedSegments } from "../../../segments";
import { getContext } from "../../../temporal/activity";
import {
  ComputedAssignment,
  ComputedPropertyAssignment,
  EnrichedJourney,
  EnrichedSegment,
  EnrichedUserProperty,
  SegmentHasBeenOperatorComparator,
  SegmentNode,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentUpdate,
  UserPropertyDefinitionType,
} from "../../../types";
import { insertProcessedComputedProperties } from "../../../userEvents/clickhouse";

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

function pathToArgs(path: string): string | null {
  try {
    return jp
      .parse(path)
      .map((c) => `'${c.expression.value}'`)
      .join(", ");
  } catch (e) {
    logger().error({ err: e });
    return null;
  }
}

function buildSegmentQueryExpression({
  currentTime,
  node,
  nodes,
}: {
  currentTime: number;
  node: SegmentNode;
  nodes: SegmentNode[];
}): string | null {
  switch (node.type) {
    case SegmentNodeType.Trait: {
      const pathArgs = pathToArgs(node.path);
      if (!pathArgs) {
        return null;
      }

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
          if (
            node.operator.comparator !== SegmentHasBeenOperatorComparator.GTE
          ) {
            throw new Error("Unimplemented comparator.");
          }

          const val = node.operator.value;
          const varName = `last_trait_update${node.id.replace(/-/g, "_")}`;
          const upperTraitBound =
            currentTime / 1000 - node.operator.windowSeconds;

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
            and(
              JSON_VALUE(
                (
                  arrayFirst(
                    m -> JSONHas(m.1, 'traits', ${pathArgs}),
                    timed_messages
                  ) as ${varName}
                ).1,
                '$.traits.${node.path}'
              ) == ${queryVal},
              ${varName}.2 < toDateTime64(${upperTraitBound}, 3)
            )`;
        }
        case SegmentOperatorType.Within: {
          const upperTraitBound = currentTime / 1000;
          const traitIdentifier = node.id.replace(/-/g, "_");

          const lowerTraitBound =
            currentTime / 1000 - node.operator.windowSeconds;

          // TODO replace array find with array first
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
      const childFragments = childNodes
        .map((childNode) =>
          buildSegmentQueryExpression({
            currentTime,
            node: childNode,
            nodes,
          })
        )
        .filter((query) => query !== null);
      return `and(
        ${childFragments.join(", ")}
      )`;
    }
    case SegmentNodeType.Or: {
      const childIds = new Set(node.children);
      const childNodes = nodes.filter((n) => childIds.has(n.id));
      const childFragments = childNodes
        .map((childNode) =>
          buildSegmentQueryExpression({
            currentTime,
            node: childNode,
            nodes,
          })
        )
        .filter((query) => query !== null);
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
}): string | null {
  const query = buildSegmentQueryExpression({
    currentTime,
    node: segment.definition.entryNode,
    nodes: segment.definition.nodes,
  });

  if (query === null) {
    return null;
  }

  return `
    (
      ${modelIndex},
      ${query},
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
}): string | null {
  let innerQuery: string;
  switch (userProperty.definition.type) {
    case UserPropertyDefinitionType.Trait: {
      const { path } = userProperty.definition;
      const pathArgs = pathToArgs(path);
      if (!pathArgs) {
        return null;
      }

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
        const fragment = buildUserPropertyQueryFragment({
          userProperty: computedProperty.userProperty,
          modelIndex: computedProperty.modelIndex,
        });

        if (fragment !== null) {
          modelFragments.push(fragment);
        }
        break;
      }
      case "Segment": {
        const fragment = buildSegmentQueryFragment({
          segment: computedProperty.segment,
          modelIndex: computedProperty.modelIndex,
          currentTime,
        });

        if (fragment !== null) {
          modelFragments.push(fragment);
        }
        break;
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
  const segmentUpdate = {
    segmentId,
    currentlyInSegment: Boolean(segmentAssignment.latest_segment_value),
    segmentVersion: new Date(segmentAssignment.max_assigned_at).getTime(),
  };

  if (!segmentUpdate.currentlyInSegment) {
    logger().debug(segmentUpdate, "not signalling for false segment");
    return;
  }

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

  const computedProperties = segmentComputedProperties.concat(
    userComputedProperties
  );

  const withClause = computedToQueryFragments({
    currentTime,
    computedProperties,
  });

  // TODO handle anonymous id's, including case where user_id is null
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
      ORDER BY latest_processing_time DESC
    ) sas
  `;

  // segment id / pg + journey id
  const subscribedSegmentPairs = subscribedJourneys.reduce<
    Map<string, Set<string>>
  >((memo, j) => {
    const subscribedSegments = getSubscribedSegments(j.definition);
    subscribedSegments.forEach((segmentId) => {
      const processFor = memo.get(segmentId) ?? new Set();
      processFor.add(j.id);
      memo.set(segmentId, processFor);
    });
    return memo;
  }, new Map());

  const subscribedSegmentPairsCh = Array.from(subscribedSegmentPairs)
    .flatMap(([segmentId, processedForSet]) =>
      Array.from(processedForSet).map(
        (processedFor) => `('${segmentId}', '${processedFor}')`
      )
    )
    .concat(["(computed_property_id, 'pg')"])
    .join(", ");

  const readQuery = `
    SELECT
      cpa.workspace_id,
      cpa.type,
      cpa.computed_property_id,
      cpa.user_id,
      cpa.latest_segment_value,
      cpa.latest_user_property_value,
      cpa.max_assigned_at,
      cpa.processed_for
    FROM (
      SELECT workspace_id,
          type,
          computed_property_id,
          user_id,
          segment_value latest_segment_value,
          user_property_value latest_user_property_value,
          assigned_at max_assigned_at,
          arrayJoin([${subscribedSegmentPairsCh}]) processed_for_pair,
          processed_for_pair.2 processed_for,
          processed_for_pair.1 == computed_property_id property_is_computed
      FROM computed_property_assignments FINAL
      WHERE type == 'segment'
      GROUP BY
        workspace_id,
        type,
        computed_property_id,
        user_id,
        segment_value,
        user_property_value,
        assigned_at

      UNION ALL
      SELECT workspace_id,
          type,
          computed_property_id,
          user_id,
          segment_value latest_segment_value,
          user_property_value latest_user_property_value,
          assigned_at max_assigned_at,
          ('', '') processed_for_pair,
          'pg' processed_for,
          True property_is_computed
      FROM computed_property_assignments FINAL
      WHERE type == 'user_property'
    ) cpa
    WHERE property_is_computed AND (
      workspace_id,
      computed_property_id,
      user_id,
      latest_segment_value,
      latest_user_property_value,
      processed_for
    ) NOT IN (
      SELECT
        workspace_id,
        computed_property_id,
        user_id,
        segment_value,
        user_property_value,
        processed_for
      FROM processed_computed_properties FINAL
    )
  `;

  await clickhouseClient().query({
    query: writeQuery,
    format: "JSONEachRow",
  });

  const resultSet = await clickhouseClient().query({
    query: readQuery,
    format: "JSONEachRow",
  });

  for await (const rows of resultSet.stream()) {
    const assignments: ComputedAssignment[] = await Promise.all(
      rows.flatMap(async (row: Row) => {
        const json = await row.json();
        const result = schemaValidate(json, ComputedAssignment);
        if (result.isErr()) {
          logger().error(
            { err: result.error, json },
            "failed to parse assignment json"
          );
          return [];
        }
        return result.value;
      })
    );

    const pgUserPropertyAssignments: ComputedAssignment[] = [];
    const pgSegmentAssignments: ComputedAssignment[] = [];
    const signalSegmentAssignments: ComputedAssignment[] = [];

    for (const assignment of assignments) {
      let assignmentCategory: ComputedAssignment[];
      if (assignment.processed_for === "pg") {
        switch (assignment.type) {
          case "segment":
            assignmentCategory = pgSegmentAssignments;
            break;
          case "user_property":
            assignmentCategory = pgUserPropertyAssignments;
            break;
        }
      } else {
        assignmentCategory = signalSegmentAssignments;
      }
      assignmentCategory.push(assignment);
    }

    logger().debug(
      {
        workspaceId,
        assignmentsCount: assignments.length,
        pgUserPropertyAssignmentsCount: pgUserPropertyAssignments.length,
        pgSegmentAssignmentsCount: pgSegmentAssignments.length,
        signalSegmentAssignmentsCount: signalSegmentAssignments.length,
      },
      "processing computed assignments"
    );

    await Promise.all([
      ...pgUserPropertyAssignments.map((a) => {
        const value = JSON.stringify(a.latest_user_property_value);
        return prisma().userPropertyAssignment.upsert({
          where: {
            workspaceId_userPropertyId_userId: {
              workspaceId,
              userId: a.user_id,
              userPropertyId: a.computed_property_id,
            },
          },
          update: { value },
          create: {
            workspaceId,
            userId: a.user_id,
            userPropertyId: a.computed_property_id,
            value,
          },
        });
      }),
      ...pgSegmentAssignments.map((a) => {
        const inSegment = Boolean(a.latest_segment_value);
        return prisma().segmentAssignment.upsert({
          where: {
            workspaceId_userId_segmentId: {
              workspaceId,
              userId: a.user_id,
              segmentId: a.computed_property_id,
            },
          },
          update: {
            inSegment,
          },
          create: {
            workspaceId,
            userId: a.user_id,
            segmentId: a.computed_property_id,
            inSegment,
          },
        });
      }),
    ]);

    await Promise.all(
      signalSegmentAssignments.flatMap((assignment) => {
        const journey = subscribedJourneys.find(
          (j) => j.id === assignment.processed_for
        );
        if (!journey) {
          logger().error(
            {
              subscribedJourneys: subscribedJourneys.map((j) => j.id),
              processed_for: assignment.processed_for,
            },
            "journey in assignment.processed_for missing from subscribed journeys"
          );
          return [];
        }

        return signalJourney({
          workspaceId,
          segmentId: assignment.computed_property_id,
          segmentAssignment: assignment,
          journey,
        });
      })
    );

    const processedAssignments: ComputedPropertyAssignment[] =
      assignments.flatMap((assignment) => ({
        workspace_id: workspaceId,
        user_property_value: assignment.latest_user_property_value,
        segment_value: assignment.latest_segment_value,
        ...assignment,
      }));

    await insertProcessedComputedProperties({
      assignments: processedAssignments,
    });
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
