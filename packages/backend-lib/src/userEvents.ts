import { ok, Result } from "neverthrow";

import { clickhouseClient, ClickHouseQueryBuilder } from "./clickhouse";
import config from "./config";
import { kafkaProducer } from "./kafka";
import logger from "./logger";
import prisma from "./prisma";
import { InternalEventType, UserEvent } from "./types";
import { buildUserEventsTableName } from "./userEvents/clickhouse";

interface InsertUserEventsParams {
  workspaceId: string;
  userEvents: {
    messageRaw: string;
    processingTime?: string;
    messageId: string;
  }[];
}

async function insertUserEventsDirect({
  workspaceId,
  userEvents,
  asyncInsert,
}: InsertUserEventsParams & { asyncInsert?: boolean }) {
  const currentTable = await prisma().currentUserEventsTable.findUnique({
    where: {
      workspaceId,
    },
  });
  if (!currentTable) {
    logger().error("Missing current table.");
    return;
  }

  await clickhouseClient().insert({
    table: `user_events_${currentTable.version} (message_raw, processing_time, workspace_id, message_id)`,
    values: userEvents.map((e) => {
      const value: {
        message_raw: string;
        processing_time: string | null;
        workspace_id: string;
        message_id: string;
      } = {
        workspace_id: workspaceId,
        message_raw: e.messageRaw,
        processing_time: e.processingTime ?? null,
        message_id: e.messageId,
      };
      return value;
    }),
    clickhouse_settings: {
      async_insert: asyncInsert ? 1 : undefined,
      wait_for_async_insert: asyncInsert ? 1 : undefined,
    },
    format: "JSONEachRow",
  });
}

export async function insertUserEvents({
  workspaceId,
  userEvents,
}: InsertUserEventsParams): Promise<void> {
  const { userEventsTopicName, writeMode } = config();
  switch (writeMode) {
    case "kafka": {
      await (
        await kafkaProducer()
      ).send({
        topic: userEventsTopicName,
        messages: userEvents.map(
          ({ messageRaw, messageId, processingTime }) => ({
            key: messageId,
            value: JSON.stringify({
              processing_time: processingTime,
              workspace_id: workspaceId,
              message_id: messageId,
              message_raw: messageRaw,
            }),
          })
        ),
      });
      break;
    }
    case "ch-async":
      await insertUserEventsDirect({
        workspaceId,
        userEvents,
        asyncInsert: true,
      });
      break;
    case "ch-sync": {
      await insertUserEventsDirect({ workspaceId, userEvents });
      break;
    }
  }
}

export async function findAllUserTraits({
  workspaceId,
  tableVersion: tableVersionParam,
}: {
  workspaceId: string;
  tableVersion?: string;
}): Promise<string[]> {
  let tableVersion = tableVersionParam;
  if (!tableVersion) {
    const currentTable = await prisma().currentUserEventsTable.findUnique({
      where: {
        workspaceId,
      },
    });

    if (!currentTable) {
      return [];
    }
    tableVersion = currentTable.version;
  }

  const query = `SELECT DISTINCT arrayJoin(JSONExtractKeys(message_raw, 'traits')) AS trait FROM ${buildUserEventsTableName(
    tableVersion
  )} WHERE workspace_id = {workspaceId:String}`;

  const resultSet = await clickhouseClient().query({
    query,
    format: "JSONEachRow",
    query_params: {
      workspaceId,
    },
  });

  const results = await resultSet.json<{ trait: string }[]>();
  return results.map((o) => o.trait);
}

async function getTableVersion({
  workspaceId,
  tableVersion: tableVersionParam,
}: {
  workspaceId: string;
  tableVersion?: string;
}): Promise<string | null> {
  let tableVersion = tableVersionParam;
  if (!tableVersion) {
    const currentTable = await prisma().currentUserEventsTable.findUnique({
      where: {
        workspaceId,
      },
    });

    if (!currentTable) {
      return null;
    }
    tableVersion = currentTable.version;
  }
  return tableVersion;
}

type UserEventsWithTraits = UserEvent & {
  traits: string;
  properties: string;
};

export async function findManyEvents({
  workspaceId,
  limit,
  offset = 0,
  tableVersion: tableVersionParam,
}: {
  workspaceId: string;
  tableVersion?: string;
  limit?: number;
  offset?: number;
}): Promise<UserEventsWithTraits[]> {
  const tableVersion = await getTableVersion({
    workspaceId,
    tableVersion: tableVersionParam,
  });

  if (!tableVersion) {
    return [];
  }

  const paginationClause = limit ? `LIMIT ${offset},${limit}` : "";
  const query = `SELECT
    workspace_id,
    event_type,
    user_id,
    anonymous_id,
    user_or_anonymous_id,
    message_id,
    event_time,
    processing_time,
    event,
    JSONExtractRaw(message_raw, 'traits') AS traits,
    JSONExtractRaw(message_raw, 'properties') AS properties
  FROM ${buildUserEventsTableName(tableVersion)}
  WHERE workspace_id = {workspaceId:String}
  ORDER BY event_time DESC, message_id
  ${paginationClause}`;

  const resultSet = await clickhouseClient().query({
    query,
    format: "JSONEachRow",
    query_params: {
      workspaceId,
    },
  });

  const results = await resultSet.json<UserEventsWithTraits[]>();
  return results;
}

// TODO implement pagination
export async function findManyInternalEvents({
  event,
  workspaceId,
}: {
  event: InternalEventType;
  workspaceId: string;
}): Promise<UserEvent[]> {
  const tableVersion = await prisma().currentUserEventsTable.findUnique({
    where: {
      workspaceId,
    },
  });

  if (!tableVersion) {
    return [];
  }

  const query = `SELECT * FROM ${buildUserEventsTableName(
    tableVersion.version
  )} WHERE event_type = 'track' AND event = {event:String} AND workspace_id = {workspaceId:String}`;

  const resultSet = await clickhouseClient().query({
    query,
    format: "JSONEachRow",
    query_params: {
      event,
      workspaceId,
    },
  });

  const results = await resultSet.json<UserEvent[]>();
  return results;
}

export interface InternalEvent {
  event: InternalEventType;
  userId: string;
  messageId: string;
  properties: Record<string, string>;
}

export async function trackInternalEvents(props: {
  workspaceId: string;
  events: InternalEvent[];
}): Promise<Result<void, Error>> {
  const { workspaceId } = props;
  const timestamp = new Date().toISOString();

  const userEvents = props.events
    .map((p) => ({
      type: "track",
      event: p.event,
      userId: p.userId,
      anonymousId: p.properties.anonymousId,
      messageId: p.messageId,
      properties: p.properties,
      timestamp,
    }))
    .map((mr) => ({
      userId: mr.userId,
      messageId: mr.messageId,
      messageRaw: JSON.stringify(mr),
    }));

  await insertUserEvents({ workspaceId, userEvents });

  return ok(undefined);
}

// TODO in the future will want to broadcast only to the users who would have been in the segment absent the broadcast, not every user
export async function submitBroadcast({
  workspaceId,
  segmentId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
  segmentId: string;
}) {
  const tableVersion = await getTableVersion({
    workspaceId,
  });
  if (!tableVersion) {
    return;
  }

  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const messageId = qb.addQueryValue(broadcastId, "String");
  const timestamp = qb.addQueryValue(new Date().toISOString(), "String");
  const segmentIdParam = qb.addQueryValue(segmentId, "String");
  const eventName = qb.addQueryValue(
    InternalEventType.SegmentBroadcast,
    "String"
  );

  const query = `
    INSERT INTO events (message_id, workspace_id, message_raw)
    SELECT
      workspace_id,
      user_id,
      ${messageId} as message_id,
      toJSONString(
        map(
          'userId', user_id,
          'timestamp', ${timestamp},
          'event', ${eventName},
          'event_type', 'track',
          'properties', map(
            'segmentId', ${segmentIdParam}
          )
        )
      ) as message_raw
    FROM ${buildUserEventsTableName(tableVersion)}
    WHERE workspace_id = ${workspaceIdParam}
    GROUP BY workspace_id, user_id
  `;

  await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
    format: "JSONEachRow",
  });
}

export async function findEventsCount({
  workspaceId,
  tableVersion: tableVersionParam,
}: {
  workspaceId: string;
  tableVersion?: string;
  limit?: number;
  offset?: number;
}): Promise<number> {
  const tableVersion = await getTableVersion({
    workspaceId,
    tableVersion: tableVersionParam,
  });

  if (!tableVersion) {
    return 0;
  }
  const query = `SELECT COUNT(message_id) AS event_count FROM ${buildUserEventsTableName(
    tableVersion
  )}
  WHERE workspace_id = {workspaceId:String}
  GROUP BY workspace_id
  `;

  const resultSet = await clickhouseClient().query({
    query,
    format: "JSONEachRow",
    query_params: {
      workspaceId,
    },
  });

  const results = await resultSet.json<{ event_count: number }[]>();
  return results[0]?.event_count ?? 0;
}
