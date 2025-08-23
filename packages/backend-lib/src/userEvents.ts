import { ClickHouseSettings, Row } from "@clickhouse/client";
import { writeToString } from "@fast-csv/format";
import { format } from "date-fns";
import { and, eq } from "drizzle-orm";
import { arrayDefault } from "isomorphic-lib/src/arrays";
import { ok, Result } from "neverthrow";

import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  query as chQuery,
} from "./clickhouse";
import config from "./config";
import { db } from "./db";
import {
  userProperty as dbUserProperty,
  workspace as dbWorkspace,
} from "./db/schema";
import { kafkaProducer } from "./kafka";
import logger from "./logger";
import {
  DownloadEventsRequest,
  EventType,
  GetEventsRequest,
  GetPropertiesResponse,
  InternalEventType,
  JSONValue,
  UserEvent,
  UserWorkflowTrackEvent,
} from "./types";

export interface InsertUserEvent {
  messageRaw: string | Record<string, unknown>;
  processingTime?: string;
  serverTime?: string;
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
      server_time: string | null;
    } = {
      workspace_id: workspaceId,
      message_raw: e.messageRaw,
      processing_time: e.processingTime ?? null,
      message_id: e.messageId,
      server_time: e.serverTime ?? null,
    };
    return value;
  });

  const settings: ClickHouseSettings = {
    async_insert: asyncInsert ? 1 : undefined,
    wait_for_async_insert: asyncInsert ? 1 : undefined,
    wait_end_of_query: asyncInsert ? undefined : 1,
  };

  await clickhouseClient().insert({
    table: `user_events_v2 (message_raw, processing_time, workspace_id, message_id, server_time)`,
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
    events,
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
          ({ messageRaw, messageId, processingTime, serverTime }) => ({
            key: messageId,
            value: JSON.stringify({
              processing_time: processingTime,
              workspace_id: workspaceId,
              message_id: messageId,
              server_time: serverTime,
              message_raw: messageRaw,
            }),
          }),
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

export type UserEventsWithTraits = UserEvent & {
  traits: string;
  properties: string;
  context?: string;
};

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

  const results = await resultSet.json<UserEvent>();
  return results;
}

export async function findUserIdByMessageId({
  messageId,
  workspaceId,
}: {
  messageId: string;
  workspaceId: string;
}): Promise<string | null> {
  const query = `SELECT user_id FROM user_events_v2 WHERE message_id = {messageId:String} AND workspace_id = {workspaceId:String} LIMIT 1`;

  const resultSet = await chQuery({
    query,
    format: "JSONEachRow",
    query_params: {
      messageId,
      workspaceId,
    },
  });

  const results = await resultSet.json<{ user_id: string }>();
  return results[0]?.user_id ?? null;
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

export async function findIdentifyTraits({
  workspaceId,
  limit = 500,
}: {
  workspaceId: string;
  limit?: number;
}): Promise<string[]> {
  const query = `
    SELECT DISTINCT
      arrayJoin(JSONExtractKeys(properties)) AS trait
    FROM user_events_v2
    WHERE
      workspace_id = {workspaceId:String}
      and event_type = 'identify'
    limit {limit:Int32}
  `;

  const resultSet = await chQuery({
    query,
    format: "JSONEachRow",
    query_params: {
      workspaceId,
      limit,
    },
  });

  const results = await resultSet.json<{ trait: string }>();
  return results.map((o) => o.trait);
}

export async function findTrackProperties({
  workspaceId,
  limit = 500,
}: {
  workspaceId: string;
  limit?: number;
}): Promise<GetPropertiesResponse["properties"]> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const limitParam = qb.addQueryValue(limit, "Int32");
  const query = `
    SELECT
      arrayJoin(JSONExtractKeys(properties)) AS property,
      max(processing_time) AS max_processing_time,
      event
    FROM user_events_v2
    WHERE
      workspace_id = ${workspaceIdParam}
      and event_type = 'track'
    GROUP BY
      property,
      event
    ORDER BY
      max_processing_time DESC
    LIMIT ${limitParam}
  `;

  const resultSet = await chQuery({
    query,
    format: "JSONEachRow",
    query_params: qb.getQueries(),
  });

  const results = await resultSet.json<{
    property: string;
    event: string;
    max_processing_time: string;
  }>();

  return results.reduce<Record<string, string[]>>((acc, o) => {
    const properties = acc[o.event] ?? [];
    properties.push(o.property);
    acc[o.event] = properties;
    return acc;
  }, {});
}

export type UserIdsByPropertyValue = Record<string, string[]>;

function buildUserEventQueryClauses(
  params: GetEventsRequest,
  qb: ClickHouseQueryBuilder,
) {
  const {
    workspaceId,
    startDate,
    endDate,
    userId,
    searchTerm,
    event,
    broadcastId,
    journeyId,
    eventType,
    messageId,
  } = params;

  const workspaceIdClause = `workspace_id = ${qb.addQueryValue(workspaceId, "String")}`;

  const startDateClause = startDate
    ? `AND processing_time >= ${qb.addQueryValue(startDate, "DateTime64(3)")}`
    : "";

  const endDateClause = endDate
    ? `AND processing_time <= ${qb.addQueryValue(endDate, "DateTime64(3)")}`
    : "";

  const userIdClause = userId
    ? `AND user_id = ${qb.addQueryValue(userId, "String")}`
    : "";

  let messageIdClause = "";
  if (messageId) {
    if (typeof messageId === "string") {
      messageIdClause = `AND message_id = ${qb.addQueryValue(messageId, "String")}`;
    } else {
      messageIdClause = `AND message_id IN ${qb.addQueryValue(messageId, "Array(String)")}`;
    }
  }

  const searchClause = searchTerm
    ? `AND (CAST(event_type AS String) LIKE ${qb.addQueryValue(
        `%${searchTerm}%`,
        "String",
      )} OR CAST(event AS String) LIKE ${qb.addQueryValue(
        `%${searchTerm}%`,
        "String",
      )} OR message_id = ${qb.addQueryValue(searchTerm, "String")})`
    : "";

  const eventClause =
    event && event.length > 0
      ? `AND event IN ${qb.addQueryValue(event, "Array(String)")}`
      : "";

  const broadcastIdClause = broadcastId
    ? `AND JSONExtractString(properties, 'broadcastId') = ${qb.addQueryValue(broadcastId, "String")}`
    : "";

  const journeyIdClause = journeyId
    ? `AND JSONExtractString(properties, 'journeyId') = ${qb.addQueryValue(journeyId, "String")}`
    : "";

  const eventTypeClause = eventType
    ? `AND event_type = ${qb.addQueryValue(eventType, "String")}`
    : "";

  return {
    workspaceIdClause,
    startDateClause,
    endDateClause,
    userIdClause,
    messageIdClause,
    searchClause,
    eventClause,
    broadcastIdClause,
    journeyIdClause,
    eventTypeClause,
  };
}

async function buildWorkspaceIdClause(
  workspaceId: string,
  qb: ClickHouseQueryBuilder,
): Promise<string> {
  const childWorkspaceIds = (
    await db()
      .select({ id: dbWorkspace.id })
      .from(dbWorkspace)
      .where(eq(dbWorkspace.parentWorkspaceId, workspaceId))
  ).map((o) => o.id);

  return childWorkspaceIds.length
    ? `workspace_id IN ${qb.addQueryValue(childWorkspaceIds, "Array(String)")}`
    : `workspace_id = ${qb.addQueryValue(workspaceId, "String")}`;
}

function buildUserEventInnerQuery(
  clauses: ReturnType<typeof buildUserEventQueryClauses> & {
    workspaceIdClause: string;
  },
  includeContext?: boolean,
) {
  const {
    workspaceIdClause,
    startDateClause,
    endDateClause,
    userIdClause,
    searchClause,
    eventClause,
    broadcastIdClause,
    journeyIdClause,
    eventTypeClause,
    messageIdClause,
  } = clauses;

  const contextField = includeContext
    ? ", JSONExtractString(message_raw, 'context') AS context"
    : "";

  return `
    SELECT
        workspace_id,
        user_id,
        user_or_anonymous_id,
        event_time,
        anonymous_id,
        message_id,
        event,
        event_type,
        processing_time,
        JSONExtractRaw(message_raw, 'traits') AS traits,
        JSONExtractRaw(message_raw, 'properties') AS properties${contextField}
    FROM user_events_v2
    WHERE
      ${workspaceIdClause}
      ${startDateClause}
      ${endDateClause}
      ${userIdClause}
      ${searchClause}
      ${eventClause}
      ${broadcastIdClause}
      ${journeyIdClause}
      ${eventTypeClause}
      ${messageIdClause}
    ORDER BY processing_time DESC
  `;
}

export async function findUserEvents({
  workspaceId,
  limit = 100,
  offset = 0,
  startDate,
  endDate,
  userId,
  searchTerm,
  event,
  broadcastId,
  journeyId,
  eventType,
  messageId,
  includeContext,
  signal,
}: GetEventsRequest & { signal?: AbortSignal }): Promise<
  UserEventsWithTraits[]
> {
  const qb = new ClickHouseQueryBuilder();

  const workspaceIdClause = await buildWorkspaceIdClause(workspaceId, qb);
  const queryClauses = buildUserEventQueryClauses(
    {
      workspaceId,
      startDate,
      endDate,
      userId,
      searchTerm,
      event,
      broadcastId,
      journeyId,
      eventType,
      messageId,
    },
    qb,
  );

  const paginationClause = limit
    ? `LIMIT ${qb.addQueryValue(offset, "Int32")},${qb.addQueryValue(
        limit,
        "Int32",
      )}`
    : "";

  const innerQuery = buildUserEventInnerQuery(
    {
      ...queryClauses,
      workspaceIdClause,
    },
    includeContext,
  );

  const eventsQuery = `
    ${innerQuery}
    ${paginationClause}
  `;

  const eventsResultSet = await chQuery(
    {
      query: eventsQuery,
      format: "JSONEachRow",
      query_params: qb.getQueries(),
    },
    { signal },
  );
  logger().debug(
    { eventsQuery, queryParams: qb.getQueries() },
    "findUserEvents query",
  );

  return await eventsResultSet.json<UserEventsWithTraits>();
}

export async function findUserEventCount({
  workspaceId,
  startDate,
  endDate,
  userId,
  searchTerm,
  event,
  broadcastId,
  journeyId,
  eventType,
  messageId,
  includeContext,
  signal,
}: Omit<GetEventsRequest, "limit" | "offset"> & {
  signal?: AbortSignal;
}): Promise<number> {
  const qb = new ClickHouseQueryBuilder();

  const workspaceIdClause = await buildWorkspaceIdClause(workspaceId, qb);
  const queryClauses = buildUserEventQueryClauses(
    {
      workspaceId,
      startDate,
      endDate,
      userId,
      searchTerm,
      event,
      broadcastId,
      journeyId,
      eventType,
      messageId,
      includeContext,
    },
    qb,
  );

  const innerQuery = buildUserEventInnerQuery(
    {
      ...queryClauses,
      workspaceIdClause,
    },
    includeContext,
  );

  const countQuery = `
    SELECT count() AS count
    FROM (${innerQuery}) AS inner_query
  `;

  const countResultSet = await chQuery(
    {
      query: countQuery,
      format: "JSONEachRow",
      query_params: qb.getQueries(),
    },
    { signal },
  );

  const countResults = await countResultSet.json<{ count: number }>();
  return countResults[0]?.count ?? 0;
}

export async function findManyEventsWithCount({
  workspaceId,
  limit = 100,
  offset = 0,
  startDate,
  endDate,
  userId,
  searchTerm,
  event,
  broadcastId,
  journeyId,
  eventType,
  messageId,
  includeContext,
  signal,
}: GetEventsRequest & { signal?: AbortSignal }): Promise<{
  events: UserEventsWithTraits[];
  count: number;
}> {
  const [events, count] = await Promise.all([
    findUserEvents({
      workspaceId,
      limit,
      offset,
      startDate,
      endDate,
      userId,
      searchTerm,
      event,
      broadcastId,
      journeyId,
      eventType,
      messageId,
      includeContext,
      signal,
    }),
    findUserEventCount({
      workspaceId,
      startDate,
      endDate,
      userId,
      searchTerm,
      event,
      broadcastId,
      journeyId,
      eventType,
      messageId,
      includeContext,
      signal,
    }),
  ]);

  return {
    events,
    count,
  };
}

export async function findUserIdsByUserProperty({
  userPropertyName,
  workspaceId,
  valueSet,
}: {
  userPropertyName: string;
  valueSet: Set<string>;
  workspaceId: string;
}): Promise<UserIdsByPropertyValue> {
  const userProperty = await db().query.userProperty.findFirst({
    where: and(
      eq(dbUserProperty.workspaceId, workspaceId),
      eq(dbUserProperty.name, userPropertyName),
    ),
  });

  if (!userProperty) {
    return {};
  }

  const queryBuilder = new ClickHouseQueryBuilder();
  const workspaceIdParam = queryBuilder.addQueryValue(workspaceId, "String");
  const computedPropertyId = queryBuilder.addQueryValue(
    userProperty.id,
    "String",
  );
  const valueSetParam = queryBuilder.addQueryValue(
    Array.from(valueSet),
    "Array(String)",
  );

  const query = `
    select user_id, user_property_value
    from computed_property_assignments_v2
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
      (rows as Row[]).forEach((row) => {
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

export async function buildEventsFile(params: DownloadEventsRequest): Promise<{
  fileName: string;
  fileContent: string;
}> {
  // Get all events without pagination for CSV export
  const { events } = await findManyEventsWithCount({
    ...params,
    limit: undefined, // Remove pagination to get all events
    offset: undefined,
  });

  // Transform events to CSV format
  const csvData = events.map((event) => ({
    messageId: event.message_id,
    eventType: event.event_type,
    event: event.event,
    userId: event.user_id || "",
    anonymousId: event.anonymous_id || "",
    processingTime: event.processing_time,
    eventTime: event.event_time,
    traits: event.traits,
    properties: event.properties,
  }));

  // Define CSV headers
  const headers = [
    "messageId",
    "eventType",
    "event",
    "userId",
    "anonymousId",
    "processingTime",
    "eventTime",
    "traits",
    "properties",
  ];

  const fileContent = await writeToString(csvData, { headers });
  const formattedDate = format(new Date(), "yyyy-MM-dd");
  const fileName = `events-${formattedDate}.csv`;

  return {
    fileName,
    fileContent,
  };
}

export async function findUserEventsById({
  messageIds,
  workspaceId,
}: {
  messageIds: string[];
  workspaceId?: string;
}): Promise<UserEventsWithTraits[]> {
  if (messageIds.length === 0) {
    return [];
  }
  const qb = new ClickHouseQueryBuilder();

  const clauses: string[] = [];

  if (messageIds.length > 0) {
    clauses.push(
      `message_id IN ${qb.addQueryValue(messageIds, "Array(String)")}`,
    );
  }

  if (workspaceId) {
    clauses.push(`workspace_id = ${qb.addQueryValue(workspaceId, "String")}`);
  }
  const whereClause = clauses.join(" AND ");

  const query = `
    SELECT
        workspace_id,
        user_id,
        user_or_anonymous_id,
        event_time,
        anonymous_id,
        message_id,
        event,
        event_type,
        processing_time,
        JSONExtractRaw(message_raw, 'traits') AS traits,
        JSONExtractRaw(message_raw, 'properties') AS properties
    FROM user_events_v2
    WHERE ${whereClause}
    ORDER BY processing_time DESC
  `;

  const resultSet = await chQuery({
    query,
    format: "JSONEachRow",
    query_params: qb.getQueries(),
  });

  return await resultSet.json<UserEventsWithTraits>();
}

export interface GetEventsByIdParams {
  workspaceId: string;
  eventIds: string[];
}

export async function getEventsById({
  workspaceId,
  eventIds,
}: GetEventsByIdParams): Promise<UserWorkflowTrackEvent[]> {
  const events = await findUserEvents({
    workspaceId,
    messageId: eventIds,
    includeContext: true,
  });
  return events.flatMap((event) => {
    if (event.event_type !== EventType.Track) {
      logger().error(
        {
          messageId: event.message_id,
          eventType: event.event_type,
        },
        "getEventsById found non-track event",
      );
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const context: Record<string, JSONValue> = event.context
      ? JSON.parse(event.context)
      : {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const properties: Record<string, JSONValue> = event.properties
      ? JSON.parse(event.properties)
      : {};
    return {
      event: event.event,
      timestamp: event.event_time,
      properties,
      context,
      messageId: event.message_id,
    };
  });
}
