import { Row } from "@clickhouse/client";
import { Journey, JourneyStatus, Prisma, PrismaClient } from "@prisma/client";
import { Type } from "@sinclair/typebox";
import { buildHeritageMap, HeritageMap } from "isomorphic-lib/src/journeys";
import { getUnsafe, MapWithDefault } from "isomorphic-lib/src/maps";
import { parseInt, round } from "isomorphic-lib/src/numbers";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";
import NodeCache from "node-cache";

import { clickhouseClient, ClickHouseQueryBuilder } from "./clickhouse";
import { startKeyedUserJourney } from "./journeys/userWorkflow/lifecycle";
import logger from "./logger";
import prisma from "./prisma";
import {
  ChannelType,
  EnrichedJourney,
  InternalEventType,
  JourneyDefinition,
  JourneyDraft,
  JourneyNodeType,
  JourneyStats,
  NodeStatsType,
  SavedJourneyResource,
  TrackData,
} from "./types";

export * from "isomorphic-lib/src/journeys";

const isValueInEnum = <T extends Record<string, string>>(
  value: string,
  enumObject: T,
): value is T[keyof T] =>
  Object.values(enumObject).includes(value as T[keyof T]);

export function enrichJourney(
  journey: Journey,
): Result<EnrichedJourney, Error> {
  let definition: JourneyDefinition | undefined;
  if (journey.definition) {
    const definitionResult = schemaValidateWithErr(
      journey.definition,
      JourneyDefinition,
    );
    if (definitionResult.isErr()) {
      return err(definitionResult.error);
    }
    definition = definitionResult.value;
  }
  let draft: JourneyDraft | undefined;
  if (journey.draft) {
    const draftResult = schemaValidateWithErr(journey.draft, JourneyDraft);
    if (draftResult.isErr()) {
      return err(draftResult.error);
    }
    draft = draftResult.value;
  }
  return ok({
    ...journey,
    draft,
    definition,
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
  const { definition, status, createdAt, updatedAt } = result.value;
  const baseResource = {
    ...result.value,
    createdAt: createdAt.getTime(),
    updatedAt: updatedAt.getTime(),
  };
  if (status === JourneyStatus.NotStarted) {
    return ok({
      ...baseResource,
      status,
    });
  }
  if (!definition) {
    return err(
      new Error(
        `journey definition is missing for journey with status ${status}`,
      ),
    );
  }

  return ok({
    ...baseResource,
    definition,
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

export async function findManyJourneyResourcesUnsafe(
  params: FindManyParams,
): Promise<SavedJourneyResource[]> {
  const journeys = await prisma().journey.findMany(params);
  const results = journeys.map((journey) => unwrap(toJourneyResource(journey)));
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

type NodeEventMap = MapWithDefault<InternalEventType, number>;

interface GetEdgePercentParams {
  originId: string;
  targetId: string;
  heritageMap: HeritageMap;
  nodeProcessedMap: Map<string, number>;
}

function getEdgePercentRaw({
  originId,
  targetId,
  heritageMap,
  nodeProcessedMap,
}: GetEdgePercentParams): number | null {
  const originMapEntry = heritageMap.get(originId);
  if (!originMapEntry) {
    return null;
  }
  if (!originMapEntry.children.has(targetId)) {
    logger().debug(
      {
        children: Array.from(originMapEntry.children),
        targetId,
        originId,
      },
      "targetId not in originId children",
    );
    return null;
  }

  const originCount = nodeProcessedMap.get(originId);
  const targetCount = nodeProcessedMap.get(targetId);
  // TODO [DF-467] handle the case of targetId is an exit node
  if (
    originCount === undefined ||
    originCount === 0 ||
    targetCount === undefined ||
    targetCount === 0
  ) {
    logger().debug(
      {
        originCount,
        targetCount,
        originId,
        targetId,
      },
      "either the origin or target have no processed nodes, returning 0 edge percent",
    );
    return null;
  }

  if (originMapEntry.children.size === 1) {
    return 1;
  }

  const targetMapEntry = heritageMap.get(targetId);
  if (!targetMapEntry) {
    return null;
  }
  if (targetMapEntry.parents.size === 1) {
    return targetCount / originCount;
  }

  // when the target has multiple parents, we need to calculate the siblings
  // count in order to handle the case of a re-joined e.g segment-split
  let siblingsCount = 0;
  for (const childId of originMapEntry.children) {
    if (childId === targetId) {
      continue;
    }
    const siblingCount = getUnsafe(nodeProcessedMap, childId);
    siblingsCount += siblingCount;
  }

  return (originCount - siblingsCount) / originCount;
}

function getEdgePercent(params: GetEdgePercentParams): number | null {
  const raw = getEdgePercentRaw(params);
  if (raw === null) {
    return null;
  }
  return round(raw * 100, 1);
}

export async function getJourneysStats({
  workspaceId,
  journeyIds: allJourneyIds,
}: {
  workspaceId: string;
  journeyIds?: string[];
}): Promise<JourneyStats[]> {
  const qb = new ClickHouseQueryBuilder();
  const journeys = await prisma().journey.findMany({
    where: {
      AND: {
        ...(allJourneyIds?.length
          ? {
              id: {
                in: allJourneyIds,
              },
            }
          : {}),
        status: {
          not: JourneyStatus.NotStarted,
        },
        definition: {
          not: Prisma.AnyNull,
        },
      },
    },
  });
  const journeyIds = journeys.map((j) => j.id);
  if (!journeyIds.length) {
    return [];
  }
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

  const statsResultSet = await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
    format: "JSONEachRow",
  });

  const stream = statsResultSet.stream();
  // map from node_id to event to count
  const statsMap = new MapWithDefault<string, NodeEventMap>(
    new MapWithDefault(0),
  );
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
        const eventMap: NodeEventMap = statsMap.get(node_id);

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
    if (!definition) {
      continue;
    }
    const heritageMap = buildHeritageMap(definition);

    for (const node of definition.nodes) {
      if (
        node.type === JourneyNodeType.RateLimitNode ||
        node.type === JourneyNodeType.ExperimentSplitNode
      ) {
        continue;
      }

      const nodeStats = statsMap.get(node.id);

      if (node.type === JourneyNodeType.SegmentSplitNode) {
        const percent = getEdgePercent({
          originId: node.id,
          targetId: node.variant.falseChild,
          heritageMap,
          nodeProcessedMap,
        });
        if (percent === null) {
          continue;
        }
        stats.nodeStats[node.id] = {
          type: NodeStatsType.SegmentSplitNodeStats,
          proportions: {
            falseChildEdge: percent,
          },
        };
      } else if (node.type === JourneyNodeType.WaitForNode) {
        const segmentChild = node.segmentChildren[0];
        if (segmentChild) {
          const percent = getEdgePercent({
            originId: node.id,
            targetId: segmentChild.id,
            heritageMap,
            nodeProcessedMap,
          });
          if (percent === null) {
            continue;
          }
          stats.nodeStats[node.id] = {
            type: NodeStatsType.WaitForNodeStats,
            proportions: {
              segmentChildEdge: percent,
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
        };
      }

      if (
        node.type !== JourneyNodeType.MessageNode ||
        (node.variant.type !== ChannelType.Email &&
          node.variant.type !== ChannelType.Sms)
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
        deliveryRate =
          node.variant.type === ChannelType.Email
            ? delivered / total
            : (sent - messageFailure) / total;
      }

      if (node.variant.type === ChannelType.Email && total > 0) {
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
          type: node.variant.type,
          deliveryRate,
          failRate: messageFailure,
          openRate,
          spamRate,
          clickRate,
        },
      };
    }
  }

  return journeysStats;
}

const EVENT_TRIGGER_JOURNEY_CACHE = new NodeCache({
  stdTTL: 30,
  checkperiod: 120,
});

interface EventTriggerJourneyDetails {
  journeyId: string;
  event: string;
  definition: JourneyDefinition;
}

export interface TriggerEventEntryJourneysOptions {
  workspaceId: string;
  event: string;
  userId: string;
  messageId: string;
  properties: TrackData["properties"];
}

export async function triggerEventEntryJourneys({
  workspaceId,
  event,
  userId,
  messageId,
  properties,
}: TriggerEventEntryJourneysOptions): Promise<void> {
  let journeyDetails: EventTriggerJourneyDetails[] | undefined =
    EVENT_TRIGGER_JOURNEY_CACHE.get(workspaceId);

  if (!journeyDetails) {
    const allJourneys = await prisma().journey.findMany({
      where: {
        workspaceId,
      },
    });
    journeyDetails = allJourneys.flatMap((j) => {
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
      if (
        journey.status !== JourneyStatus.Running ||
        journey.definition.entryNode.type !== JourneyNodeType.EventEntryNode
      ) {
        return [];
      }
      return {
        event: journey.definition.entryNode.event,
        journeyId: journey.id,
        definition: journey.definition,
      };
    });
    EVENT_TRIGGER_JOURNEY_CACHE.set(workspaceId, journeyDetails);
  }

  const starts: Promise<unknown>[] = journeyDetails.flatMap(
    ({ journeyId, event: journeyEvent, definition }) => {
      if (journeyEvent !== event) {
        return [];
      }
      return startKeyedUserJourney({
        workspaceId,
        userId,
        journeyId,
        eventKey: messageId,
        definition,
        context: properties,
      });
    },
  );
  await Promise.all(starts);
}
