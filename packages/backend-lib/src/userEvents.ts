import { ClickHouseSettings, Row } from "@clickhouse/client";
import { arrayDefault } from "isomorphic-lib/src/arrays";
import { ok, Result } from "neverthrow";

import { clickhouseClient, ClickHouseQueryBuilder } from "./clickhouse";
import config from "./config";
import { kafkaProducer } from "./kafka";
import prisma from "./prisma";
import { InternalEventType, UserEvent } from "./types";

export interface InsertUserEvent {
  messageRaw: string | Record<string, unknown>;
  processingTime?: string;
  messageId: string;
}

interface InsertUserEventInternal extends InsertUserEvent {
  messageRaw: string;
}
export interface InsertUserEventsParams {
  workspaceId: string;
  // README: for ease of backwards compatibility, we allow both userEvents and events
  userEvents?: InsertUserEvent[];
  events?: InsertUserEvent[];
}

async function insertUserEventsDirect({
  workspaceId,
  userEvents,
  asyncInsert,
}: Omit<InsertUserEventsParams, "events" | "userEvents"> & {
  userEvents: InsertUserEventInternal[];
  asyncInsert?: boolean;
}) {
  const values = userEvents.map((e) => {
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
  });

  const settings: ClickHouseSettings = {
    async_insert: asyncInsert ? 1 : undefined,
    wait_for_async_insert: asyncInsert ? 1 : undefined,
    wait_end_of_query: asyncInsert ? undefined : 1,
  };

  await clickhouseClient().insert({
    table: `user_events_v2 (message_raw, processing_time, workspace_id, message_id)`,
    values,
    clickhouse_settings: settings,
    format: "JSONEachRow",
  });
}

export async function insertUserEvents({
  workspaceId,
  userEvents,
  events,
}: InsertUserEventsParams): Promise<void> {
  const { userEventsTopicName, writeMode } = config();
  const userEventsWithDefault: InsertUserEventInternal[] = arrayDefault(
    userEvents,
    events
  ).map((e) => ({
    ...e,
    messageRaw:
      typeof e.messageRaw === "string"
        ? e.messageRaw
        : JSON.stringify(e.messageRaw),
  }));

  switch (writeMode) {
    // TODO migrate over to new table structure
    case "kafka": {
      await (
        await kafkaProducer()
      ).send({
        topic: userEventsTopicName,
        messages: userEventsWithDefault.map(
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
        userEvents: userEventsWithDefault,
        asyncInsert: true,
      });
      break;
    case "ch-sync": {
      await insertUserEventsDirect({
        workspaceId,
        userEvents: userEventsWithDefault,
      });
      break;
    }
  }
}

type UserEventsWithTraits = UserEvent & {
  traits: string;
  properties: string;
};

export async function findManyEvents({
  workspaceId,
  limit,
  offset = 0,
  startDate,
  endDate,
  userId,
}: {
  workspaceId: string;
  userId?: string;
  limit?: number;
  offset?: number;
  // unix timestamp units ms
  startDate?: number;
  endDate?: number;
}): Promise<UserEventsWithTraits[]> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");

  const paginationClause = limit
    ? `LIMIT ${qb.addQueryValue(offset, "Int32")},${qb.addQueryValue(
        limit,
        "Int32"
      )}`
    : "";

  const startDateClause = startDate
    ? `AND event_time >= ${qb.addQueryValue(startDate, "DateTime64(3)")}`
    : "";

  const endDateClause = endDate
    ? `AND event_time <= ${qb.addQueryValue(endDate, "DateTime64(3)")}`
    : "";

  const userIdClause = userId
    ? `AND user_id = ${qb.addQueryValue(userId, "String")}`
    : "";

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
  FROM user_events_v2
  WHERE workspace_id = ${workspaceIdParam}
  ${startDateClause}
  ${endDateClause}
  ${userIdClause}
  ORDER BY event_time DESC, message_id
  ${paginationClause}`;

  const resultSet = await clickhouseClient().query({
    query,
    format: "JSONEachRow",
    query_params: qb.getQueries(),
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
  const query = `SELECT * FROM user_events_v2 WHERE event_type = 'track' AND event = {event:String} AND workspace_id = {workspaceId:String}`;

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

export async function findEventsCount({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<number> {
  const userIdClause = userId ? `AND user_id = {userId:String}` : "";

  const query = `SELECT COUNT(message_id) AS event_count FROM user_events_v2 
  WHERE workspace_id = {workspaceId:String}
  ${userIdClause}
  GROUP BY workspace_id
  `;

  const resultSet = await clickhouseClient().query({
    query,
    format: "JSONEachRow",
    query_params: {
      workspaceId,
      userId,
    },
  });

  const results = await resultSet.json<{ event_count: number }[]>();
  return results[0]?.event_count ?? 0;
}

export async function findIdentifyTraits({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<string[]> {
  const query = `
    SELECT DISTINCT
      arrayJoin(JSONExtractKeys(message_raw, 'traits')) AS trait
    FROM user_events_v2
    WHERE workspace_id = {workspaceId:String}
  `;

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

export type UserIdsByPropertyValue = Record<string, string[]>;

export async function findUserIdsByUserProperty({
  userPropertyName,
  workspaceId,
  valueSet,
}: {
  userPropertyName: string;
  valueSet: Set<string>;
  workspaceId: string;
}): Promise<UserIdsByPropertyValue> {
  const userProperty = await prisma().userProperty.findUnique({
    where: {
      workspaceId_name: {
        workspaceId,
        name: userPropertyName,
      },
    },
  });
  if (!userProperty) {
    return {};
  }

  const queryBuilder = new ClickHouseQueryBuilder();
  const workspaceIdParam = queryBuilder.addQueryValue(workspaceId, "String");
  const computedPropertyId = queryBuilder.addQueryValue(
    userProperty.id,
    "String"
  );
  const valueSetParam = queryBuilder.addQueryValue(
    Array.from(valueSet),
    "Array(String)"
  );

  const query = `
    select user_id, user_property_value
    from computed_property_assignments
    where workspace_id = ${workspaceIdParam}
      and user_property_value in ${valueSetParam}
      and computed_property_id = ${computedPropertyId}
    order by assigned_at desc
  `;

  const queryResults = await clickhouseClient().query({
    query,
    format: "JSONEachRow",
    query_params: queryBuilder.getQueries(),
  });

  const result: UserIdsByPropertyValue = {};

  for await (const rows of queryResults.stream()) {
    await Promise.all([
      rows.map(async (row: Row) => {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { user_id, user_property_value } = row.json<{
          user_id: string;
          user_property_value: string;
        }>();
        let userResult = result[user_property_value];
        if (!userResult) {
          userResult = [];
          result[user_property_value] = userResult;
        }
        userResult.push(user_id);
      }),
    ]);
  }
  return result;
}
