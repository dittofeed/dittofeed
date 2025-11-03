import { writeToString } from "@fast-csv/format";
import { Static, Type } from "@sinclair/typebox";
import { format } from "date-fns";
import {
  jsonParseSafe,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  filter as rFilter,
  groupBy,
  join,
  map,
  omit,
  pipe,
  values,
} from "remeda";

import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  query as chQuery,
  streamClickhouseQuery,
} from "./clickhouse";
import logger from "./logger";
import { deserializeCursor, serializeCursor } from "./pagination";
import {
  ChannelType,
  GetDeliveryBodyRequest,
  InternalEventType,
  MessageSendSuccessContents,
  MessageSendSuccessVariant,
  SearchDeliveriesRequest,
  SearchDeliveriesRequestSortByEnum,
  SearchDeliveriesResponse,
  SearchDeliveriesResponseItem,
  SortDirectionEnum,
  StatusEventsList,
} from "./types";

const OffsetKey = "o" as const;

// TODO use real token / cursor, not just encoded offset
const Cursor = Type.Object({
  [OffsetKey]: Type.Number(),
});

type Cursor = Static<typeof Cursor>;

function parseCursorOffset(cursor?: string): number {
  if (!cursor) {
    return 0;
  }
  const deserialized = deserializeCursor(cursor);
  const result = schemaValidateWithErr(deserialized, Cursor);
  if (result.isErr()) {
    logger().info(
      {
        err: result.error,
      },
      "Failed to parse deliveries cursor",
    );
    return 0;
  }
  return result.value[OffsetKey];
}

function serializeCursorOffset(offset: number): string {
  return serializeCursor({
    [OffsetKey]: offset,
  });
}

interface DeliverySearchQueryBody {
  messageSendsCte: {
    head: string;
    tail: string;
  };
  statusEventsCte: string;
  triggeringEventsCte?: string;
  fromClause: string;
  hasContextOrTriggeringFilters: boolean;
}

interface AppendWhereClauseArgs {
  baseClause: string;
  condition?: string;
}

function appendWhereClause({
  baseClause,
  condition,
}: AppendWhereClauseArgs): string {
  if (!condition) {
    return baseClause;
  }
  if (!baseClause) {
    return ` WHERE ${condition}`;
  }
  return `${baseClause}
    AND ${condition}`;
}

interface BuildDeliverySearchQueryBodyArgs {
  params: SearchDeliveriesRequest;
  qb: ClickHouseQueryBuilder;
}

export function buildDeliverySearchQueryBody({
  params,
  qb,
}: BuildDeliverySearchQueryBodyArgs): DeliverySearchQueryBody {
  const {
    workspaceId,
    journeyId,
    channels,
    userId,
    to,
    from,
    statuses,
    templateIds,
    startDate,
    endDate,
    groupId,
    broadcastId,
    triggeringProperties: triggeringPropertiesInput,
    contextValues: contextValuesInput,
  } = params;

  const triggeringProperties = triggeringPropertiesInput
    ? triggeringPropertiesInput.map(({ key, value }) => ({ key, value }))
    : undefined;
  const contextValues = contextValuesInput
    ? contextValuesInput.map(({ key, value }) => ({ key, value }))
    : undefined;

  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");

  const messageSendsConditions: string[] = [
    `workspace_id = ${workspaceIdParam}`,
    `event = '${InternalEventType.MessageSent}'`,
    `hidden = false`,
  ];

  if (journeyId) {
    messageSendsConditions.push(
      `journey_id = ${qb.addQueryValue(journeyId, "String")}`,
    );
  }
  if (broadcastId) {
    messageSendsConditions.push(
      `broadcast_id = ${qb.addQueryValue(broadcastId, "String")}`,
    );
  }
  if (templateIds) {
    messageSendsConditions.push(
      `template_id IN ${qb.addQueryValue(templateIds, "Array(String)")}`,
    );
  }
  if (channels) {
    messageSendsConditions.push(
      `channel_type IN ${qb.addQueryValue(channels, "Array(String)")}`,
    );
  }
  if (to) {
    messageSendsConditions.push(
      `delivery_to IN ${qb.addQueryValue(to, "Array(String)")}`,
    );
  }
  if (from) {
    messageSendsConditions.push(
      `delivery_from IN ${qb.addQueryValue(from, "Array(String)")}`,
    );
  }
  if (startDate) {
    messageSendsConditions.push(
      `processing_time >= parseDateTimeBestEffort(${qb.addQueryValue(startDate, "String")}, 'UTC')`,
    );
  }
  if (endDate) {
    messageSendsConditions.push(
      `processing_time <= parseDateTimeBestEffort(${qb.addQueryValue(endDate, "String")}, 'UTC')`,
    );
  }
  if (userId) {
    if (Array.isArray(userId)) {
      messageSendsConditions.push(
        `user_or_anonymous_id IN ${qb.addQueryValue(userId, "Array(String)")}`,
      );
    } else {
      messageSendsConditions.push(
        `user_or_anonymous_id = ${qb.addQueryValue(userId, "String")}`,
      );
    }
  }
  if (groupId) {
    const groupIdArray = Array.isArray(groupId) ? groupId : [groupId];
    const groupIdParams = qb.addQueryValue(groupIdArray, "Array(String)");
    messageSendsConditions.push(`
      (workspace_id, user_or_anonymous_id) IN (
        SELECT
          workspace_id,
          user_id
        FROM (
          SELECT
            workspace_id,
            group_id,
            user_id,
            argMax(assigned, assigned_at) as is_assigned
          FROM group_user_assignments
          WHERE
            workspace_id = ${workspaceIdParam}
          GROUP BY
            workspace_id,
            group_id,
            user_id
          HAVING group_id IN ${groupIdParams}
        )
        WHERE is_assigned = true
      )`);
  }

  const statusEventsList = StatusEventsList;
  const statusEventsConditions: string[] = [
    `workspace_id = ${workspaceIdParam}`,
    `event IN ${qb.addQueryValue(statusEventsList, "Array(String)")}`,
  ];
  logger().debug(
    { statusEventsList, queryParams: qb.getQueries() },
    "statusEventsList",
  );

  if (journeyId) {
    statusEventsConditions.push(
      `journey_id = ${qb.addQueryValue(journeyId, "String")}`,
    );
  }
  if (broadcastId) {
    statusEventsConditions.push(
      `broadcast_id = ${qb.addQueryValue(broadcastId, "String")}`,
    );
  }
  if (startDate) {
    statusEventsConditions.push(
      `processing_time >= parseDateTimeBestEffort(${qb.addQueryValue(startDate, "String")}, 'UTC')`,
    );
  }
  if (endDate) {
    statusEventsConditions.push(
      `processing_time <= parseDateTimeBestEffort(${qb.addQueryValue(endDate, "String")}, 'UTC')`,
    );
  }

  // Helper to build tolerant conditions for JSON fields on either the triggering event properties
  // or the delivery context. This function constructs a WHERE fragment that matches provided key/value
  // pairs regardless of storage representation (scalar vs array, string vs number).
  //
  // Input semantics:
  // - items: array of {key, value} filters. Multiple entries with the same key are OR'ed together.
  // - Different keys are AND'ed together.
  // - targetExpr: a vetted ClickHouse JSON expression identifying the object to search. Supported targets:
  //     - "triggering_events.properties" (joined table of the triggering event)
  //     - "JSONExtractString(uev.message_raw, 'context')" (context captured on the MessageSent event)
  //
  // Matching semantics for a single key/value:
  // - If value is a string:
  //   - Match string scalar: JSONExtractString(target, key) = value
  //   - Match string array: has(JSONExtract(target, key, 'Array(String)'), value)
  //   - If toInt64OrNull(value) is not NULL, also match numeric scalar/array using the casted number
  //     so that "741207" will match 741207 and [741207, ...].
  // - If value is a number:
  //   - Match numeric scalar: JSONExtractInt(target, key) = value
  //   - Match numeric array: has(JSONExtract(target, key, 'Array(Int64)'), value)
  //   - Also allow string forms: JSONExtractString(target, key) = toString(value) and has(Array(String), toString(value))
  function buildPropertyConditionsForTarget(
    items: { key: string; value: string | number }[],
    targetExpr: string,
  ): string {
    const groupedByKey = groupBy(items, ({ key }) => key);

    const pathConditions = pipe(
      groupedByKey,
      values,
      map((keyItems) => {
        const { key } = keyItems[0];
        if (!key) {
          return null;
        }
        const keyParam = qb.addQueryValue(key, "String");

        const valueConditions = map(keyItems, ({ value }) => {
          if (typeof value === "string") {
            const stringParam = qb.addQueryValue(value, "String");
            const stringScalarCheck = `(JSONExtractString(${targetExpr}, ${keyParam}) = ${stringParam})`;
            const arrayStringCheck = `has(JSONExtract(${targetExpr}, ${keyParam}, 'Array(String)'), ${stringParam})`;
            const toInt = `toInt64OrNull(${stringParam})`;
            const numberScalarCheck = `(JSONExtractInt(${targetExpr}, ${keyParam}) = ${toInt})`;
            const arrayIntCheck = `has(JSONExtract(${targetExpr}, ${keyParam}, 'Array(Int64)'), ifNull(${toInt}, 0))`;
            const numericGroup = `((${toInt}) IS NOT NULL AND (${numberScalarCheck} OR ${arrayIntCheck}))`;
            return `(${stringScalarCheck} OR ${arrayStringCheck} OR ${numericGroup})`;
          }
          if (typeof value === "number") {
            const roundedValue = Math.floor(value);
            const intParam = qb.addQueryValue(roundedValue, "Int64");
            const numberScalarCheck = `(JSONExtractInt(${targetExpr}, ${keyParam}) = ${intParam})`;
            const arrayIntCheck = `has(JSONExtract(${targetExpr}, ${keyParam}, 'Array(Int64)'), ${intParam})`;
            const stringParam = qb.addQueryValue(String(roundedValue), "String");
            const stringScalarCheck = `(JSONExtractString(${targetExpr}, ${keyParam}) = ${stringParam})`;
            const arrayStringCheck = `has(JSONExtract(${targetExpr}, ${keyParam}, 'Array(String)'), ${stringParam})`;
            return `(${numberScalarCheck} OR ${arrayIntCheck} OR ${stringScalarCheck} OR ${arrayStringCheck})`;
          }
          logger().error({ key, value, workspaceId }, "Unexpected type");
          return null;
        });

        const validValueConditions = rFilter(
          valueConditions,
          (c) => c !== null,
        );
        if (validValueConditions.length === 0) {
          return null;
        }
        return `(${join(validValueConditions, " OR ")})`;
      }),
      rFilter((c): c is string => c !== null),
    );

    if (pathConditions.length > 0) {
      return join(pathConditions, " AND ");
    }
    return "1=0";
  }

  let triggeringPropertiesClauseTrigger = "";
  if (triggeringProperties && triggeringProperties.length > 0) {
    triggeringPropertiesClauseTrigger = buildPropertyConditionsForTarget(
      triggeringProperties,
      "triggering_events.properties",
    );
  }

  let contextValuesClause = "";
  if (contextValues && contextValues.length > 0) {
    contextValuesClause = buildPropertyConditionsForTarget(
      contextValues,
      "JSONExtractString(uev.message_raw, 'context')",
    );
  }

  const hasContextOrTriggeringFilters = Boolean(
    (triggeringProperties &&
      triggeringProperties.length > 0 &&
      triggeringPropertiesClauseTrigger !== "1=0") ||
      (contextValues &&
        contextValues.length > 0 &&
        contextValuesClause !== "1=0"),
  );

  let finalWhereClause = "";
  const hasValidTriggeringPropsTrigger = Boolean(
    triggeringPropertiesClauseTrigger &&
      triggeringPropertiesClauseTrigger !== "1=0",
  );
  const hasValidContextValues = Boolean(
    contextValuesClause && contextValuesClause !== "1=0",
  );

  if (hasValidTriggeringPropsTrigger && hasValidContextValues) {
    finalWhereClause = ` WHERE ((triggering_events.properties IS NOT NULL AND (${triggeringPropertiesClauseTrigger})) OR (JSONExtractString(uev.message_raw, 'context') != '' AND (${contextValuesClause})))`;
  } else if (hasValidTriggeringPropsTrigger) {
    finalWhereClause = ` WHERE triggering_events.properties IS NOT NULL AND (${triggeringPropertiesClauseTrigger})`;
  } else if (hasValidContextValues) {
    finalWhereClause = ` WHERE JSONExtractString(uev.message_raw, 'context') != '' AND (${contextValuesClause})`;
  }

  const statusesCondition = statuses
    ? `if(se.origin_message_id != '', se.last_event, '${InternalEventType.MessageSent}') IN ${qb.addQueryValue(statuses, "Array(String)")}`
    : "";
  const whereClause = appendWhereClause({
    baseClause: finalWhereClause,
    condition: statusesCondition,
  });

  const messageSendsCteHead = `
      SELECT DISTINCT * FROM (
        SELECT
          workspace_id,
          user_or_anonymous_id,
          processing_time,
          message_id,
          event_time,
          triggering_message_id
        FROM internal_events
        WHERE
          ${messageSendsConditions.join(" AND ")}
        ORDER BY processing_time DESC`;
  const messageSendsCteTail = `
      )`;

  const statusEventsCte = `
      SELECT
        workspace_id,
        user_or_anonymous_id,
        origin_message_id,
        argMax(event, event_time) as last_event,
        max(event_time) as max_event_time
      FROM internal_events
      WHERE
        ${statusEventsConditions.join(" AND ")}
        AND origin_message_id IN (
          SELECT message_id FROM message_sends
        )
      GROUP BY workspace_id, user_or_anonymous_id, origin_message_id`;

  const triggeringEventsCte = hasValidTriggeringPropsTrigger
    ? `
      SELECT
        message_id,
        properties
      FROM user_events_v2
      WHERE
        workspace_id = ${workspaceIdParam}
        AND message_id IN (
          SELECT DISTINCT triggering_message_id
          FROM message_sends
          WHERE triggering_message_id != ''
        )`
    : undefined;

  let fromClause = `
    FROM message_sends ms
    LEFT JOIN status_events se ON
      ms.workspace_id = se.workspace_id
      AND ms.message_id = se.origin_message_id
      AND ms.user_or_anonymous_id = se.user_or_anonymous_id
    INNER JOIN (
      SELECT DISTINCT
        workspace_id,
        user_or_anonymous_id,
        processing_time,
        event_time,
        message_id,
        properties,
        message_raw,
        anonymous_id
      FROM user_events_v2
      WHERE
        (workspace_id, processing_time, user_or_anonymous_id, event_time, message_id) IN (
          SELECT
            workspace_id,
            processing_time,
            user_or_anonymous_id,
            event_time,
            message_id
          FROM message_sends
        )
    ) as uev ON
      ms.workspace_id = uev.workspace_id
      AND ms.user_or_anonymous_id = uev.user_or_anonymous_id
      AND ms.processing_time = uev.processing_time
      AND ms.event_time = uev.event_time
      AND ms.message_id = uev.message_id`;
  if (hasValidTriggeringPropsTrigger) {
    fromClause += `
    LEFT JOIN triggering_events ON ms.triggering_message_id = triggering_events.message_id`;
  }
  if (whereClause) {
    fromClause += `
    ${whereClause.trimStart()}`;
  }

  return {
    messageSendsCte: {
      head: messageSendsCteHead,
      tail: messageSendsCteTail,
    },
    statusEventsCte,
    triggeringEventsCte,
    fromClause,
    hasContextOrTriggeringFilters,
  };
}

interface BuildDeliverySearchQueryArgs {
  params: SearchDeliveriesRequest;
  qb: ClickHouseQueryBuilder;
}

export function buildDeliverySearchQuery({
  params,
  qb,
}: BuildDeliverySearchQueryArgs): {
  query: string;
  queryParams: Record<string, unknown>;
} {
  const {
    cursor,
    limit = 20,
    sortBy = SearchDeliveriesRequestSortByEnum.sentAt,
    sortDirection = SortDirectionEnum.Desc,
  } = params;

  const offset = parseCursorOffset(cursor);
  const queryBody = buildDeliverySearchQueryBody({
    params,
    qb,
  });

  const innerLimit = !queryBody.hasContextOrTriggeringFilters
    ? `LIMIT ${qb.addQueryValue(limit, "UInt64")} OFFSET ${qb.addQueryValue(offset, "UInt64")}`
    : "";
  const outerLimit = queryBody.hasContextOrTriggeringFilters
    ? `LIMIT ${qb.addQueryValue(limit, "UInt64")} OFFSET ${qb.addQueryValue(offset, "UInt64")}`
    : "";

  let sortByClause: string;
  const direction = sortDirection === SortDirectionEnum.Desc ? "DESC" : "ASC";
  switch (sortBy) {
    case "sentAt": {
      sortByClause = `sent_at ${direction}, origin_message_id ASC`;
      break;
    }
    case "status": {
      sortByClause = `last_event ${direction}, sent_at DESC, origin_message_id ASC`;
      break;
    }
    case "from": {
      sortByClause = `JSON_VALUE(properties, '$.variant.from') ${direction}, sent_at DESC, origin_message_id ASC`;
      break;
    }
    case "to": {
      sortByClause = `JSON_VALUE(properties, '$.variant.to') ${direction}, sent_at DESC, origin_message_id ASC`;
      break;
    }
    default: {
      assertUnreachable(sortBy);
    }
  }

  const messageSendsCteQuery = `${queryBody.messageSendsCte.head}${
    innerLimit ? `\n        ${innerLimit}` : ""
  }${queryBody.messageSendsCte.tail}`;

  const query = `
    WITH message_sends AS (
${messageSendsCteQuery}
    ),
    status_events AS (
${queryBody.statusEventsCte}
    )${queryBody.triggeringEventsCte ? `,
    triggering_events AS (
${queryBody.triggeringEventsCte}
    )` : ""}
    SELECT
      if(se.origin_message_id != '', se.last_event, '${InternalEventType.MessageSent}') as last_event,
      uev.properties as properties,
      JSONExtractString(uev.message_raw, 'context') as context,
      if(se.origin_message_id != '', se.max_event_time, ms.event_time) as updated_at,
      ms.event_time as sent_at,
      ms.user_or_anonymous_id as user_or_anonymous_id,
      ms.message_id as origin_message_id,
      ms.triggering_message_id as triggering_message_id,
      ms.workspace_id as workspace_id,
      if(uev.anonymous_id != '', 1, 0) as is_anonymous
${queryBody.fromClause}
    ORDER BY ${sortByClause}${outerLimit ? `
    ${outerLimit}` : ""}
  `;

  return {
    query,
    queryParams: qb.getQueries(),
  };
}

export async function searchDeliveriesCount(
  params: SearchDeliveriesRequest & {
    abortSignal?: AbortSignal;
  },
): Promise<number> {
  const { abortSignal, ...searchParams } = params;
  const qb = new ClickHouseQueryBuilder();

  const queryBody = buildDeliverySearchQueryBody({
    params: searchParams as SearchDeliveriesRequest,
    qb,
  });

  const messageSendsCteQuery = `${queryBody.messageSendsCte.head}${queryBody.messageSendsCte.tail}`;

  const query = `
    WITH message_sends AS (
${messageSendsCteQuery}
    ),
    status_events AS (
${queryBody.statusEventsCte}
    )${queryBody.triggeringEventsCte ? `,
    triggering_events AS (
${queryBody.triggeringEventsCte}
    )` : ""}
    SELECT count() AS count
${queryBody.fromClause}
  `;

  logger().debug(
    {
      query,
      queryParams: qb.getQueries(),
    },
    "searchDeliveriesCount query",
  );

  const resultSet = await chQuery({
    query,
    query_params: qb.getQueries(),
    format: "JSONEachRow",
    clickhouse_settings: {
      date_time_output_format: "iso",
      function_json_value_return_type_allow_complex: 1,
    },
    abort_signal: abortSignal,
  });

  const rows = await resultSet.json<{ count: number | string }>();
  const rawCount = rows[0]?.count;
  return typeof rawCount === "number" ? rawCount : Number(rawCount ?? 0);
}

export const SearchDeliveryRow = Type.Object({
  last_event: Type.String(),
  properties: Type.String(),
  updated_at: Type.String(),
  sent_at: Type.String(),
  origin_message_id: Type.String(),
  triggering_message_id: Type.Optional(Type.String()),
  workspace_id: Type.String(),
  user_or_anonymous_id: Type.String(),
  is_anonymous: Type.Number(),
});

export type SearchDeliveryRow = Static<typeof SearchDeliveryRow>;

export function parseSearchDeliveryRow(
  row: SearchDeliveryRow,
): SearchDeliveriesResponseItem | null {
  const properties = row.properties.length
    ? (JSON.parse(row.properties) as Record<string, unknown>)
    : {};
  const unvalidatedItem = omit(
    {
      sentAt: row.sent_at,
      updatedAt: row.updated_at,
      status: row.last_event,
      originMessageId: row.origin_message_id,
      triggeringMessageId: row.triggering_message_id,
      userId: row.user_or_anonymous_id,
      isAnonymous: row.is_anonymous === 1 ? true : undefined,
      channel:
        properties.channnel ??
        properties.messageType ??
        properties.type ??
        ChannelType.Email,
      to: properties.to ?? properties.email,
      ...properties,
    } as Record<string, unknown>,
    ["email"],
  );

  const itemResult = schemaValidateWithErr(
    unvalidatedItem,
    SearchDeliveriesResponseItem,
  );

  if (itemResult.isErr()) {
    logger().error(
      {
        unvalidatedItem,
        err: itemResult.error,
      },
      "Failed to parse delivery item from clickhouse",
    );
    return null;
  }
  return itemResult.value;
}

export async function getDeliveryBody({
  workspaceId,
  userId,
  ...rest
}: GetDeliveryBodyRequest): Promise<MessageSendSuccessVariant | null> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const userIdParam = qb.addQueryValue(userId, "String");
  let templateClause = "";
  let journeyClause = "";
  let triggeringMessageIdClause = "";
  let messageIdClause = "";

  // Build OR conditions instead of exclusive if/else
  const conditions: string[] = [];

  if (typeof rest.triggeringMessageId === "string") {
    triggeringMessageIdClause = `JSONExtractString(properties, 'triggeringMessageId') = ${qb.addQueryValue(
      rest.triggeringMessageId,
      "String",
    )}`;
    if (typeof rest.templateId === "string") {
      templateClause = `JSONExtractString(properties, 'templateId') = ${qb.addQueryValue(
        rest.templateId,
        "String",
      )}`;
      conditions.push(`(${triggeringMessageIdClause} AND ${templateClause})`);
    } else {
      conditions.push(`(${triggeringMessageIdClause})`);
    }
  }

  if (typeof rest.messageId === "string") {
    messageIdClause = `message_id = ${qb.addQueryValue(
      rest.messageId,
      "String",
    )}`;
    conditions.push(`(${messageIdClause})`);
  }

  if (
    typeof rest.journeyId === "string" &&
    typeof rest.templateId === "string"
  ) {
    journeyClause = `JSONExtractString(properties, 'journeyId') = ${qb.addQueryValue(
      rest.journeyId,
      "String",
    )}`;
    templateClause = `JSONExtractString(properties, 'templateId') = ${qb.addQueryValue(
      rest.templateId,
      "String",
    )}`;
    conditions.push(`(${journeyClause} AND ${templateClause})`);
  }

  const orCondition =
    conditions.length > 0 ? `AND (${conditions.join(" OR ")})` : "";
  const query = `
    SELECT
      properties
    FROM user_events_v2
    WHERE
      event = '${InternalEventType.MessageSent}'
      AND workspace_id = ${workspaceIdParam}
      AND event_type = 'track'
      AND user_or_anonymous_id = ${userIdParam}
      ${orCondition}
    ORDER BY processing_time DESC
    LIMIT 1
  `;
  const result = await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
    format: "JSONEachRow",
  });
  const results = await result.json();
  const delivery = results[0] as { properties: string } | undefined;
  if (!delivery) {
    return null;
  }
  const propertiesResult = jsonParseSafe(delivery.properties);
  if (propertiesResult.isErr()) {
    return null;
  }

  const parsedResult = schemaValidateWithErr(
    propertiesResult.value,
    MessageSendSuccessContents,
  ).unwrapOr(null);

  return parsedResult?.variant ?? null;
}

export async function searchDeliveries({
  workspaceId,
  cursor,
  limit = 20,
  journeyId,
  sortBy = SearchDeliveriesRequestSortByEnum.sentAt,
  sortDirection = SortDirectionEnum.Desc,
  channels,
  userId,
  to,
  from,
  statuses,
  templateIds,
  startDate,
  endDate,
  groupId,
  broadcastId,
  triggeringProperties: triggeringPropertiesInput,
  contextValues: contextValuesInput,
  abortSignal,
}: SearchDeliveriesRequest & {
  abortSignal?: AbortSignal;
}): Promise<SearchDeliveriesResponse> {
  const queryBuilder = new ClickHouseQueryBuilder();

  const { query, queryParams } = buildDeliverySearchQuery({
    params: {
      workspaceId,
      cursor,
      limit,
      journeyId,
      sortBy,
      sortDirection,
      channels,
      userId,
      to,
      from,
      statuses,
      templateIds,
      startDate,
      endDate,
      groupId,
      broadcastId,
      triggeringProperties: triggeringPropertiesInput,
      contextValues: contextValuesInput,
    },
    qb: queryBuilder,
  });

  const offset = parseCursorOffset(cursor);
  logger().debug(
    {
      query,
      queryParams,
    },
    "searchDeliveries query",
  );

  const result = await chQuery({
    query,
    query_params: queryParams,
    format: "JSONEachRow",
    clickhouse_settings: {
      date_time_output_format: "iso",
      function_json_value_return_type_allow_complex: 1,
    },
    abort_signal: abortSignal,
  });

  const items: SearchDeliveriesResponseItem[] = [];
  await streamClickhouseQuery(result, (rows) => {
    for (const row of rows) {
      const parseResult = schemaValidateWithErr(row, SearchDeliveryRow);
      if (parseResult.isErr()) {
        logger().error(
          {
            err: parseResult.error,
            workspaceId,
            journeyId,
            userId,
            row,
          },
          "Failed to parse delivery row",
        );
        continue;
      }
      const parsedRow = parseResult.value;
      const parsedItem = parseSearchDeliveryRow(parsedRow);
      if (!parsedItem) {
        continue;
      }
      items.push(parsedItem);
    }
  });

  const responseCursor =
    items.length >= limit ? serializeCursorOffset(offset + limit) : undefined;

  const previousOffset = Math.max(offset - limit, 0);
  const responsePreviousCursor =
    offset > 0 ? serializeCursorOffset(previousOffset) : undefined;

  return {
    workspaceId,
    items,
    cursor: responseCursor,
    previousCursor: responsePreviousCursor,
  };
}

export async function buildDeliveriesFile(
  request: Omit<SearchDeliveriesRequest, "limit" | "cursor">,
): Promise<{
  fileName: string;
  fileContent: string;
}> {
  const deliveries = await searchDeliveries({
    ...request,
    limit: 10000,
  });

  const csvData = deliveries.items.map((delivery) => ({
    sentAt: delivery.sentAt,
    updatedAt: delivery.updatedAt,
    journeyId: delivery.journeyId || "",
    broadcastId: delivery.broadcastId || "",
    userId: delivery.userId,
    isAnonymous: delivery.isAnonymous ? "true" : "false",
    originMessageId: delivery.originMessageId,
    triggeringMessageId: delivery.triggeringMessageId || "",
    templateId: delivery.templateId,
    status: delivery.status,
    variant: "variant" in delivery ? JSON.stringify(delivery.variant) : "",
  }));

  const fileContent = await writeToString(csvData, {
    headers: [
      "sentAt",
      "updatedAt",
      "journeyId",
      "broadcastId",
      "userId",
      "isAnonymous",
      "originMessageId",
      "triggeringMessageId",
      "templateId",
      "status",
      "variant",
    ],
  });

  const formattedDate = format(new Date(), "yyyy-MM-dd");
  const fileName = `deliveries-${formattedDate}.csv`;

  return {
    fileName,
    fileContent,
  };
}
