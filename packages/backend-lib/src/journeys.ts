import { Row } from "@clickhouse/client";
import { Journey, PrismaClient } from "@prisma/client";
import { Type } from "@sinclair/typebox";
import { MapWithDefault } from "isomorphic-lib/src/maps";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import { clickhouseClient, ClickHouseQueryBuilder } from "./clickhouse";
import config from "./config";
import logger from "./logger";
import prisma from "./prisma";
import {
  ChannelType,
  EnrichedJourney,
  InternalEventType,
  JourneyDefinition,
  JourneyNodeType,
  JourneyResource,
  JourneyStats,
  NodeStatsType,
} from "./types";
import { buildUserEventsTableName } from "./userEvents/clickhouse";

export * from "isomorphic-lib/src/journeys";

export function enrichJourney(
  journey: Journey
): Result<EnrichedJourney, Error> {
  const definitionResult = schemaValidateWithErr(
    journey.definition,
    JourneyDefinition
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
  params: FindManyParams
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
  journey: Journey
): Result<JourneyResource, Error> {
  const result = enrichJourney(journey);
  if (result.isErr()) {
    return err(result.error);
  }
  const { id, name, workspaceId, definition, status } = result.value;
  return ok({
    id,
    name,
    workspaceId,
    status,
    definition,
  });
}

// TODO don't use this method for activities. Don't want to retry failures typically.
export async function findManyJourneysUnsafe(
  params: FindManyParams
): Promise<EnrichedJourney[]> {
  const result = await findManyJourneys(params);
  return unwrap(result);
}

const JourneyMessageStatsRow = Type.Object({
  event: Type.String(),
  node_id: Type.String(),
  count: Type.Number(),
});

const isValueInEnum = <T extends Record<string, string>>(
  value: string,
  enumObject: T
): value is T[keyof T] =>
  Object.values(enumObject).includes(value as T[keyof T]);

export async function getJourneyStats({
  workspaceId,
  journeyId,
}: {
  workspaceId: string;
  journeyId: string;
}): Promise<JourneyStats | null> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdQuery = qb.addQueryValue(workspaceId, "String");
  const journeyIdQuery = qb.addQueryValue(journeyId, "String");

  const currentTable = buildUserEventsTableName(
    (
      await prisma().currentUserEventsTable.findUnique({
        where: {
          workspaceId,
        },
      })
    )?.version ?? config().defaultUserEventsTableVersion
  );

  const query = `
    select
        event,
        node_id,
        count() event_count
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
            event
        from ${currentTable}
        where
            workspace_id = ${workspaceIdQuery}
            and journey_id = ${journeyIdQuery}
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
            )
    )
    group by event, node_id;`;

  const [statsResultSet, journey] = await Promise.all([
    clickhouseClient().query({
      query,
      query_params: qb.getQueries(),
      format: "JSONEachRow",
    }),
    prisma().journey.findUnique({
      where: {
        id: journeyId,
      },
    }),
  ]);
  if (!journey) {
    return null;
  }

  const stream = statsResultSet.stream();
  const statsMap = new Map<string, MapWithDefault<InternalEventType, number>>();

  stream.on("data", (rows: Row[]) => {
    rows.forEach((row: Row) => {
      const validated = schemaValidateWithErr(row, JourneyMessageStatsRow);
      if (validated.isErr()) {
        logger().error(
          { row, workspaceId, journeyId },
          "Failed to validate row from clickhouse for journey stats"
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
            journeyId,
          },
          "got unknown event type in journey stats"
        );
        return;
      }

      eventMap.set(event, count);
      statsMap.set(node_id, eventMap);
    });
  });

  await new Promise((resolve) => {
    stream.on("end", () => {
      resolve(0);
    });
  });

  const { definition } = unwrap(enrichJourney(journey));

  const stats: JourneyStats = {
    workspaceId,
    journeyId,
    nodeStats: {},
  };

  for (const node of definition.nodes) {
    if (
      node.type !== JourneyNodeType.MessageNode ||
      node.variant.type !== ChannelType.Email
    ) {
      continue;
    }
    const nodeStats = statsMap.get(node.id) ?? new MapWithDefault(0);

    const sent = nodeStats.get(InternalEventType.MessageSent);
    const badConfig = nodeStats.get(
      InternalEventType.BadWorkspaceConfiguration
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

  return stats;
}
