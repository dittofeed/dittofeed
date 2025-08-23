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
  EmailEventList,
  GetDeliveryBodyRequest,
  InternalEventType,
  MessageSendSuccessContents,
  MessageSendSuccessVariant,
  SearchDeliveriesRequest,
  SearchDeliveriesRequestSortByEnum,
  SearchDeliveriesResponse,
  SearchDeliveriesResponseItem,
  SortDirectionEnum,
} from "./types";

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
  const offset = parseCursorOffset(cursor);
  const triggeringProperties = triggeringPropertiesInput
    ? triggeringPropertiesInput.map(({ key, value }) => ({ key, value }))
    : undefined;
  const contextValues = contextValuesInput
    ? contextValuesInput.map(({ key, value }) => ({ key, value }))
    : undefined;
  const queryBuilder = new ClickHouseQueryBuilder();
  const workspaceIdParam = queryBuilder.addQueryValue(workspaceId, "String");
  const eventList = queryBuilder.addQueryValue(EmailEventList, "Array(String)");
  const journeyIdClause = journeyId
    ? `AND parsed_properties.journeyId = ${queryBuilder.addQueryValue(journeyId, "String")}`
    : "";
  const broadcastIdClause = broadcastId
    ? `AND parsed_properties.broadcastId = ${queryBuilder.addQueryValue(
        broadcastId,
        "String",
      )}`
    : "";
  let userIdClause = "";
  if (userId) {
    if (Array.isArray(userId)) {
      userIdClause = `AND user_or_anonymous_id IN ${queryBuilder.addQueryValue(
        userId,
        "Array(String)",
      )}`;
    } else {
      userIdClause = `AND user_or_anonymous_id = ${queryBuilder.addQueryValue(
        userId,
        "String",
      )}`;
    }
  }
  const channelClause = channels
    ? `AND JSON_VALUE(properties, '$.variant.type') IN ${queryBuilder.addQueryValue(
        channels,
        "Array(String)",
      )}`
    : "";
  const toClause = to
    ? `AND JSON_VALUE(properties, '$.variant.to') IN ${queryBuilder.addQueryValue(
        to,
        "Array(String)",
      )}`
    : "";
  const fromClause = from
    ? `AND JSON_VALUE(properties, '$.variant.from') IN ${queryBuilder.addQueryValue(
        from,
        "Array(String)",
      )}`
    : "";
  const templateIdHavingClause = templateIds
    ? `AND parsed_properties.templateId IN ${queryBuilder.addQueryValue(templateIds, "Array(String)")}`
    : "";
  const statusClause = statuses
    ? `AND last_event IN ${queryBuilder.addQueryValue(
        statuses,
        "Array(String)",
      )}`
    : "";
  const startDateClause = startDate
    ? `AND processing_time >= parseDateTimeBestEffort(${queryBuilder.addQueryValue(startDate, "String")}, 'UTC')`
    : "";
  const endDateClause = endDate
    ? `AND processing_time <= parseDateTimeBestEffort(${queryBuilder.addQueryValue(endDate, "String")}, 'UTC')`
    : "";
  let groupIdClause = "";
  if (groupId) {
    const groupIdArray = Array.isArray(groupId) ? groupId : [groupId];
    const groupIdParams = queryBuilder.addQueryValue(
      groupIdArray,
      "Array(String)",
    );
    groupIdClause = `
      AND (workspace_id, user_or_anonymous_id) IN (
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
            AND group_id IN ${groupIdParams}
          GROUP BY
            workspace_id,
            group_id,
            user_id
        )
        WHERE is_assigned = true
      )`;
  }

  // Helper to build tolerant conditions for JSON fields on either the triggering event properties
  // or the delivery context. This function constructs a WHERE fragment that matches provided key/value
  // pairs regardless of storage representation (scalar vs array, string vs number).
  //
  // Input semantics:
  // - items: array of {key, value} filters. Multiple entries with the same key are OR'ed together.
  // - Different keys are AND'ed together.
  // - targetExpr: a vetted ClickHouse JSON expression string identifying the object to search, and must
  //   be one of:
  //     - "triggering_events.properties" (joined table of the triggering event)
  //     - "inner_grouped.context" (context captured on the MessageSent event)
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
        const keyParam = queryBuilder.addQueryValue(key, "String");

        // For a single key, build an OR over all values provided for that key
        const valueConditions = map(keyItems, ({ value }) => {
          if (typeof value === "string") {
            const stringParam = queryBuilder.addQueryValue(value, "String");
            const stringScalarCheck = `(JSONExtractString(${targetExpr}, ${keyParam}) = ${stringParam})`;
            const arrayStringCheck = `has(JSONExtract(${targetExpr}, ${keyParam}, 'Array(String)'), ${stringParam})`;
            // Attempt numeric match via safe cast in ClickHouse
            const toInt = `toInt64OrNull(${stringParam})`;
            const numberScalarCheck = `(JSONExtractInt(${targetExpr}, ${keyParam}) = ${toInt})`;
            const arrayIntCheck = `has(JSONExtract(${targetExpr}, ${keyParam}, 'Array(Int64)'), ifNull(${toInt}, 0))`;
            const numericGroup = `((${toInt}) IS NOT NULL AND (${numberScalarCheck} OR ${arrayIntCheck}))`;
            return `(${stringScalarCheck} OR ${arrayStringCheck} OR ${numericGroup})`;
          }
          if (typeof value === "number") {
            const roundedValue = Math.floor(value);
            const intParam = queryBuilder.addQueryValue(roundedValue, "Int64");
            const numberScalarCheck = `(JSONExtractInt(${targetExpr}, ${keyParam}) = ${intParam})`;
            const arrayIntCheck = `has(JSONExtract(${targetExpr}, ${keyParam}, 'Array(Int64)'), ${intParam})`;
            // Also allow matching if the stored value is stringified
            const stringParam = queryBuilder.addQueryValue(
              String(roundedValue),
              "String",
            );
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

  // Process context values filtering
  let contextValuesClause = "";
  if (contextValues && contextValues.length > 0) {
    contextValuesClause = buildPropertyConditionsForTarget(
      contextValues,
      "inner_grouped.context",
    );
  }

  let sortByClause: string;

  const withClauses: string[] = [];
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
      withClauses.push(`
          JSON_VALUE(properties, '$.variant.to') as to
      `);
      sortByClause = `to ${direction}, sent_at DESC, origin_message_id ASC`;
      break;
    }
    default: {
      assertUnreachable(sortBy);
    }
  }
  const withClause =
    withClauses.length > 0 ? `WITH ${withClauses.join(", ")} ` : "";

  let finalWhereClause = "WHERE 1=1";

  // Combine triggeringProperties and contextValues with OR logic for backwards compatibility
  const hasValidTriggeringPropsTrigger =
    triggeringPropertiesClauseTrigger &&
    triggeringPropertiesClauseTrigger !== "1=0";
  const hasValidContextValues =
    contextValuesClause && contextValuesClause !== "1=0";

  if (hasValidTriggeringPropsTrigger && hasValidContextValues) {
    // Both inputs present - OR join-based triggering props with explicit context filters
    finalWhereClause += ` AND ((triggering_events.properties IS NOT NULL AND (${triggeringPropertiesClauseTrigger})) OR (inner_grouped.context IS NOT NULL AND inner_grouped.context != '' AND (${contextValuesClause})))`;
  } else if (hasValidTriggeringPropsTrigger) {
    // Only triggeringProperties provided: match only triggering event properties via join
    finalWhereClause += ` AND triggering_events.properties IS NOT NULL AND (${triggeringPropertiesClauseTrigger})`;
  } else if (hasValidContextValues) {
    // Only context values
    finalWhereClause += ` AND inner_grouped.context IS NOT NULL AND inner_grouped.context != '' AND (${contextValuesClause})`;
  }

  const query = `
    ${withClause}
    SELECT
      inner_grouped.last_event,
      inner_grouped.properties,
      inner_grouped.context,
      inner_grouped.updated_at,
      inner_grouped.sent_at,
      inner_grouped.user_or_anonymous_id,
      inner_grouped.origin_message_id,
      inner_grouped.triggering_message_id,
      inner_grouped.workspace_id,
      inner_grouped.is_anonymous
    FROM (
        SELECT
          argMax(event, event_time) last_event,
          anyIf(properties, properties != '') properties,
          anyIf(context, context != '') context,
          max(event_time) updated_at,
          min(event_time) sent_at,
          user_or_anonymous_id,
          origin_message_id,
          anyIf(parsed_properties, inner_extracted.properties != '') parsed_properties,
          any(triggering_message_id) as triggering_message_id,
          workspace_id,
          is_anonymous
        FROM (
          SELECT
            uev.workspace_id,
            uev.user_or_anonymous_id,
            if(uev.event = 'DFInternalMessageSent', uev.properties, '') properties,
            if(uev.event = 'DFInternalMessageSent', JSONExtractString(uev.message_raw, 'context'), '') context,
            uev.event,
            uev.event_time,
            if(
              uev.properties != '',
              JSONExtract(uev.properties, 'Tuple(messageId String, triggeringMessageId String, broadcastId String, journeyId String, templateId String)'),
              CAST(('', '', '', '', ''), 'Tuple(messageId String, triggeringMessageId String, broadcastId String, journeyId String, templateId String)')
            ) AS parsed_properties,
            if(uev.event = '${InternalEventType.MessageSent}', uev.message_id, parsed_properties.messageId) origin_message_id,
            if(uev.event = '${InternalEventType.MessageSent}', parsed_properties.triggeringMessageId, '') triggering_message_id,
            JSONExtractBool(uev.message_raw, 'context', 'hidden') as hidden,
            uev.anonymous_id != '' as is_anonymous
          FROM user_events_v2 AS uev
          WHERE
            uev.event in ${eventList}
            AND uev.workspace_id = ${workspaceIdParam}
            AND hidden = False
            ${channelClause}
            ${toClause}
            ${fromClause}
            ${startDateClause}
            ${endDateClause}
            ${groupIdClause}
        ) AS inner_extracted
        GROUP BY workspace_id, user_or_anonymous_id, origin_message_id, is_anonymous
        HAVING
          origin_message_id != ''
          AND properties != ''
          ${journeyIdClause}
          ${broadcastIdClause}
          ${templateIdHavingClause}
          ${userIdClause}
          ${statusClause}
    ) AS inner_grouped
    ${
      triggeringProperties &&
      triggeringProperties.length > 0 &&
      triggeringPropertiesClauseTrigger !== "1=0"
        ? `LEFT JOIN (
      SELECT
        message_id,
        properties
      FROM user_events_v2
      WHERE workspace_id = ${workspaceIdParam}
    ) AS triggering_events ON inner_grouped.triggering_message_id = triggering_events.message_id`
        : ""
    }
    ${finalWhereClause}
    ORDER BY ${sortByClause}
    LIMIT ${queryBuilder.addQueryValue(offset, "UInt64")},${queryBuilder.addQueryValue(limit, "UInt64")}
  `;

  const result = await chQuery({
    query,
    query_params: queryBuilder.getQueries(),
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
