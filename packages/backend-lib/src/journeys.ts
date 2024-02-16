import { Row } from "@clickhouse/client";
import { Journey, JourneyStatus, PrismaClient } from "@prisma/client";
import { Type } from "@sinclair/typebox";
import { MapWithDefault } from "isomorphic-lib/src/maps";
import { parseInt } from "isomorphic-lib/src/numbers";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import { clickhouseClient, ClickHouseQueryBuilder } from "./clickhouse";
import logger from "./logger";
import prisma from "./prisma";
import {
  ChannelType,
  EnrichedJourney,
  EventEntryNode,
  InternalEventType,
  JourneyDefinition,
  JourneyNodeType,
  JourneyStats,
  MessageChannelStats,
  NodeStatsType,
  SavedJourneyResource,
} from "./types";
import { startKeyedUserJourney } from "./segments/computePropertiesWorkflow/lifecycle";

export * from "isomorphic-lib/src/journeys";

export function enrichJourney(
  journey: Journey,
): Result<EnrichedJourney, Error> {
  const definitionResult = schemaValidateWithErr(
    journey.definition,
    JourneyDefinition,
  );
  if (definitionResult.isErr()) {
    return err(definitionResult.error);
  }
  return ok({
    ...journey,
    definition: definitionResult.value,
  });
}

type FindManyParams = Parameters<PrismaClient["journey"]["findMany"]>[0];

export async function findManyJourneys(
  params: FindManyParams,
): Promise<Result<EnrichedJourney[], Error>> {
  const journeys = await prisma().journey.findMany(params);

  const subscribedJourneys: EnrichedJourney[] = [];

  for (const journey of journeys) {
    const enrichedJourney = enrichJourney(journey);

    if (enrichedJourney.isErr()) {
      return err(enrichedJourney.error);
    }

    subscribedJourneys.push(enrichedJourney.value);
  }

  return ok(subscribedJourneys);
}

export function toJourneyResource(
  journey: Journey,
): Result<SavedJourneyResource, Error> {
  const result = enrichJourney(journey);
  if (result.isErr()) {
    return err(result.error);
  }
  const {
    id,
    name,
    workspaceId,
    definition,
    status,
    createdAt,
    updatedAt,
    canRunMultiple,
  } = result.value;

  return ok({
    id,
    name,
    workspaceId,
    status,
    definition,
    canRunMultiple,
    createdAt: createdAt.getTime(),
    updatedAt: updatedAt.getTime(),
  });
}

export async function findManyJourneyResourcesSafe(
  params: FindManyParams,
): Promise<Result<SavedJourneyResource, Error>[]> {
  const journeys = await prisma().journey.findMany(params);
  const results: Result<SavedJourneyResource, Error>[] = journeys.map(
    (journey) => toJourneyResource(journey),
  );
  return results;
}

// TODO don't use this method for activities. Don't want to retry failures typically.
export async function findManyJourneysUnsafe(
  params: FindManyParams,
): Promise<EnrichedJourney[]> {
  const result = await findManyJourneys(params);
  return unwrap(result);
}

const JourneyMessageStatsRow = Type.Object({
  event: Type.String(),
  node_id: Type.String(),
  count: Type.String(),
});

const isValueInEnum = <T extends Record<string, string>>(
  value: string,
  enumObject: T,
): value is T[keyof T] =>
  Object.values(enumObject).includes(value as T[keyof T]);

export async function getJourneysStats({
  workspaceId,
  journeyIds,
}: {
  workspaceId: string;
  journeyIds: string[];
}): Promise<JourneyStats[]> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdQuery = qb.addQueryValue(workspaceId, "String");
  const journeyIdsQuery = qb.addQueryValue(journeyIds, "Array(String)");

  const query = `
  select
    event,
    node_id,
    count(resolved_message_id) count
from (
    select
        JSON_VALUE(
            message_raw,
            '$.properties.journeyId'
        ) journey_id,
        JSON_VALUE(
            message_raw,
            '$.properties.nodeId'
        ) node_id,
        JSON_VALUE(
            message_raw,
            '$.properties.runId'
        ) run_id,
        if(
            (
            JSON_VALUE(
                message_raw,
                '$.properties.messageId'
            ) as property_message_id 
            ) != '',
            property_message_id,
            message_id
        ) resolved_message_id,
        event
    from user_events_v2
    where
        workspace_id = ${workspaceIdQuery}
        and journey_id in ${journeyIdsQuery}
        and event_type = 'track'
        and (
            event = 'DFInternalMessageSent'
            or event = 'DFMessageFailure'
            or event = 'DFMessageSkipped'
            or event = 'DFEmailDropped'
            or event = 'DFEmailDelivered'
            or event = 'DFEmailOpened'
            or event = 'DFEmailClicked'
            or event = 'DFEmailBounced'
            or event = 'DFEmailMarkedSpam'
            or event = 'DFBadWorkspaceConfiguration'
            or event = 'DFJourneyNodeProcessed'
        )
    group by journey_id, node_id, run_id, resolved_message_id, event
)
group by event, node_id;`;

  const [statsResultSet, journeys] = await Promise.all([
    clickhouseClient().query({
      query,
      query_params: qb.getQueries(),
      format: "JSONEachRow",
    }),
    prisma().journey.findMany({
      where: {
        id: {
          in: journeyIds,
        },
      },
    }),
  ]);

  const stream = statsResultSet.stream();
  const statsMap = new Map<string, MapWithDefault<InternalEventType, number>>();
  const nodeProcessedMap = new Map<string, number>();

  const rowPromises: Promise<unknown>[] = [];
  stream.on("data", (rows: Row[]) => {
    rows.forEach((row: Row) => {
      const promise = (async () => {
        const json = await row.json();
        const validated = schemaValidateWithErr(json, JourneyMessageStatsRow);
        if (validated.isErr()) {
          logger().error(
            { workspaceId, err: validated.error },
            "Failed to validate row from clickhouse for journey stats",
          );
          return;
        }
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { event, node_id, count } = validated.value;
        const eventMap = statsMap.get(node_id) ?? new MapWithDefault(0);

        if (!isValueInEnum(event, InternalEventType)) {
          logger().error(
            {
              event,
              workspaceId,
            },
            "got unknown event type in journey stats",
          );
          return;
        }

        eventMap.set(event, parseInt(count));
        statsMap.set(node_id, eventMap);

        if (event === InternalEventType.JourneyNodeProcessed) {
          nodeProcessedMap.set(node_id, parseInt(count));
        }
      })();
      rowPromises.push(promise);
    });
  });

  await Promise.all([
    new Promise((resolve) => {
      stream.on("end", () => {
        resolve(0);
      });
    }),
    ...rowPromises,
  ]);

  const enrichedJourneys = journeys.map((journey) =>
    unwrap(enrichJourney(journey)),
  );

  const journeysStats: JourneyStats[] = [];

  for (const journey of enrichedJourneys) {
    const journeyId = journey.id;
    const { definition } = journey;

    const stats: JourneyStats = {
      workspaceId,
      journeyId,
      nodeStats: {},
    };
    journeysStats.push(stats);

    for (const node of definition.nodes) {
      if (
        node.type === JourneyNodeType.RateLimitNode ||
        node.type === JourneyNodeType.ExperimentSplitNode
      ) {
        continue;
      }

      const nodeStats = statsMap.get(node.id) ?? new MapWithDefault(0);

      if (node.type === JourneyNodeType.SegmentSplitNode) {
        const parentNodeProcessed = nodeProcessedMap.get(node.id);
        const falseChildNodesProcessed =
          nodeProcessedMap.get(node.variant.falseChild) ?? 0;

        if (parentNodeProcessed) {
          const falseChildNodeProcessedRate =
            falseChildNodesProcessed / parentNodeProcessed;
          const falseChildEdgeProportion = (
            falseChildNodeProcessedRate * 100
          ).toFixed(1);

          stats.nodeStats[node.id] = {
            type: NodeStatsType.SegmentSplitNodeStats,
            proportions: {
              falseChildEdge: parseFloat(falseChildEdgeProportion),
            },
          };
        }
      } else if (node.type === JourneyNodeType.WaitForNode) {
        const parentNodeProcessed = nodeProcessedMap.get(node.id);
        let segmentChildNodesProcessed = 0;

        if (node.segmentChildren[0]) {
          segmentChildNodesProcessed =
            nodeProcessedMap.get(node.segmentChildren[0].id) ?? 0;
        }

        if (parentNodeProcessed) {
          const segmentChildNodeProcessedRate =
            segmentChildNodesProcessed / parentNodeProcessed;
          const segmentChildEdgeProportion = (
            segmentChildNodeProcessedRate * 100
          ).toFixed(1);

          stats.nodeStats[node.id] = {
            type: NodeStatsType.WaitForNodeStats,
            proportions: {
              segmentChildEdge: parseFloat(segmentChildEdgeProportion),
            },
          };
        }
      } else if (node.type === JourneyNodeType.DelayNode) {
        stats.nodeStats[node.id] = {
          type: NodeStatsType.DelayNodeStats,
          proportions: {
            childEdge: 100,
          },
        };
      } else {
        stats.nodeStats[node.id] = {
          type: NodeStatsType.MessageNodeStats,
          proportions: {
            childEdge: 100,
          },
          sendRate: 0,
          channelStats: {} as MessageChannelStats,
        };
      }

      if (
        node.type !== JourneyNodeType.MessageNode ||
        node.variant.type !== ChannelType.Email
      ) {
        continue;
      }

      const sent = nodeStats.get(InternalEventType.MessageSent);
      const badConfig = nodeStats.get(
        InternalEventType.BadWorkspaceConfiguration,
      );
      const messageFailure = nodeStats.get(InternalEventType.MessageFailure);
      const delivered = nodeStats.get(InternalEventType.EmailDelivered);
      const spam = nodeStats.get(InternalEventType.EmailMarkedSpam);
      const opened = nodeStats.get(InternalEventType.EmailOpened);
      const clicked = nodeStats.get(InternalEventType.EmailClicked);
      const total = sent + badConfig + messageFailure;

      let sendRate = 0;
      let deliveryRate = 0;
      let openRate = 0;
      let clickRate = 0;
      let spamRate = 0;
      if (total > 0) {
        sendRate = sent / total;
        deliveryRate = delivered / total;
        openRate = opened / total;
        clickRate = clicked / total;
        spamRate = spam / total;
      }

      stats.nodeStats[node.id] = {
        type: NodeStatsType.MessageNodeStats,
        proportions: {
          childEdge: 100,
        },
        sendRate,
        channelStats: {
          type: ChannelType.Email,
          deliveryRate,
          openRate,
          spamRate,
          clickRate,
        },
      };
    }
  }

  return journeysStats;
}

export async function getEventTriggeredJourneys({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<SavedJourneyResource[]> {
  const allJourneys = await prisma().journey.findMany({
    where: {
      workspaceId,
    },
  });
  const allJourneyResources: SavedJourneyResource[] = allJourneys.flatMap(
    (journey) => {
      const result = toJourneyResource(journey);
      if (result.isErr()) {
        logger().error(
          {
            workspaceId,
            journeyId: journey.id,
          },
          "Failed to convert journey to resource",
        );
        return [];
      }
      if (
        result.value.definition.entryNode.type !==
        JourneyNodeType.EventEntryNode
      ) {
        return [];
      }
      return result.value;
    },
  );
  return allJourneyResources;
}

export async function triggerEventEntryJourneys({
  workspaceId,
  event,
  userId,
}: {
  workspaceId: string;
  event: string;
  userId: string;
}): Promise<void> {
  // FIXME add caching
  const allJourneys = await prisma().journey.findMany({
    where: {
      workspaceId,
    },
  });
  const journeyDetails: {
    journeyId: string;
    event: string;
    definition: JourneyDefinition;
  }[] = allJourneys.flatMap((j) => {
    const result = toJourneyResource(j);
    if (result.isErr()) {
      logger().error(
        {
          workspaceId,
          journeyId: j.id,
        },
        "Failed to convert journey to resource",
      );
      return [];
    }
    const journey = result.value;
    if (journey.definition.entryNode.type !== JourneyNodeType.EventEntryNode) {
      return [];
    }
    if (journey.status !== JourneyStatus.Running) {
      return [];
    }
    return {
      event: journey.definition.entryNode.event,
      journeyId: journey.id,
      definition: journey.definition,
    };
  });
  const starts: Promise<unknown>[] = journeyDetails.flatMap(
    ({ journeyId, event: journeyEvent, definition }) => {
      if (journeyEvent !== event) {
        return [];
      }
      return startKeyedUserJourney({
        workspaceId,
        userId,
        journeyId,
        definition
      });
    },
  );
  await Promise.all(starts);
}
