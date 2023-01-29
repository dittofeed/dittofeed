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
        case SegmentOperatorType.Within: {
          const upperTraitBound = currentTime / 1000;
          const traitIdentifier = node.id.replace(/-/g, "_");

          const lowerTraitBound =
            currentTime / 1000 - node.operator.windowSeconds;

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
  node,
  nodes,
}: {
  currentTime: number;
  modelIndex: number;
  node: SegmentNode;
  nodes: SegmentNode[];
}): string {
  return `
    (
      ${modelIndex},
      ${buildSegmentQueryExpression({ currentTime, node, nodes })},
      Null
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
      ${innerQuery}
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
            node: computedProperty.segment.definition.entryNode,
            nodes: computedProperty.segment.definition.nodes,
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
    currentlyInSegment: Boolean(segmentAssignment.in_segment),
    eventHistoryLength: Number(segmentAssignment.history_length),
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
  processingTimeLowerBound,
  subscribedJourneys,
  tableVersion,
  workspaceId,
  userProperties,
  newComputedIds,
}: ComputePropertiesPeriodParams): Promise<Result<number | null, Error>> {
  const segmentResult = await findAllEnrichedSegments(workspaceId);

  if (segmentResult.isErr()) {
    return err(new Error(JSON.stringify(segmentResult.error)));
  }

  const segments = segmentResult.value;
  const modelIds: string[] = segments
    .map((s) => s.id)
    .concat(userProperties.map((up) => up.id));

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
  const lowerBoundClause =
    processingTimeLowerBound && !Object.keys(newComputedIds ?? {}).length
      ? `HAVING latest_processing_time >= toDateTime64(${
          processingTimeLowerBound / 1000
        }, 3)`
      : "";

  const joinedWithClause = Array.from(withClause)
    .map(([key, value]) => `${value} AS ${key}`)
    .join(",\n");

  // TODO handle anonymous ids
  const query = `
    WITH
      ${joinedWithClause}
    SELECT user_id, history_length, model_index, in_segment, user_property, latest_processing_time, timed_messages
    FROM dittofeed.user_events_${tableVersion}
    WHERE workspace_id == '${workspaceId}' AND isNotNull(user_id)
    GROUP BY user_id
    ${lowerBoundClause}
    ORDER BY latest_processing_time DESC
  `;

  const resultSet = await clickhouseClient.query({
    query,
    format: "JSONEachRow",
  });

  let lastProcessingTime: null | number = null;

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

    await Promise.all([
      ...assignments.map((a) => {
        const userPropertyId = modelIds[a.model_index];

        if (!userPropertyId || !a.user_property) {
          return;
        }

        return prisma.userPropertyAssignment.upsert({
          where: {
            userId_userPropertyId: {
              userId: a.user_id,
              userPropertyId,
            },
          },
          update: {
            value: a.user_property,
          },
          create: {
            userId: a.user_id,
            userPropertyId,
            value: a.user_property,
          },
        });
      }),
      ...assignments.map((a) => {
        const segmentId = modelIds[a.model_index];
        if (!segmentId) {
          return null;
        }

        const inSegment = Boolean(a.in_segment);
        return prisma.segmentAssignment.upsert({
          where: {
            userId_segmentId: {
              userId: a.user_id,
              segmentId,
            },
          },
          update: {
            inSegment,
          },
          create: {
            userId: a.user_id,
            segmentId,
            inSegment,
          },
        });
      }),
    ]);

    const signalBatch: Promise<void>[] = [];
    for (const assignment of assignments) {
      if (!lastProcessingTime) {
        lastProcessingTime = Number(assignment.latest_processing_time) * 1000;
      }

      const segmentId = modelIds[assignment.model_index];

      if (!segmentId) {
        continue;
      }

      for (const journey of subscribedJourneys) {
        if (
          !newComputedIds?.[journey.id] &&
          processingTimeLowerBound &&
          // TODO move this logic into the query
          Number(assignment.latest_processing_time) * 1000 <
            processingTimeLowerBound
        ) {
          continue;
        }
        const subscribedSegments = getSubscribedSegments(journey.definition);
        if (!subscribedSegments.has(segmentId)) {
          continue;
        }
        signalBatch.push(
          signalJourney({
            workspaceId,
            segmentId,
            segmentAssignment: assignment,
            journey,
          })
        );
      }
    }
    await Promise.all(signalBatch);
  }

  return ok(lastProcessingTime);
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
): Promise<number | null> {
  return unwrap(await computePropertiesPeriodSafe(params));
}
