import { Static, Type } from "@sinclair/typebox";
import {
  jsonParseSafe,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { omit } from "remeda";

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
  if (typeof rest.triggeringMessageId === "string") {
    triggeringMessageIdClause = `AND JSONExtractString(properties, 'triggeringMessageId') = ${qb.addQueryValue(
      rest.triggeringMessageId,
      "String",
    )}`;
    if (typeof rest.templateId === "string") {
      templateClause = `AND JSONExtractString(properties, 'templateId') = ${qb.addQueryValue(
        rest.templateId,
        "String",
      )}`;
    }
  } else if (typeof rest.messageId === "string") {
    messageIdClause = `AND message_id = ${qb.addQueryValue(
      rest.messageId,
      "String",
    )}`;
  } else {
    journeyClause = `AND JSONExtractString(properties, 'journeyId') = ${qb.addQueryValue(
      rest.journeyId,
      "String",
    )}`;
    templateClause = `AND JSONExtractString(properties, 'templateId') = ${qb.addQueryValue(
      rest.templateId,
      "String",
    )}`;
  }
  const query = `
    SELECT
      properties
    FROM user_events_v2
    WHERE
      event = '${InternalEventType.MessageSent}'
      AND workspace_id = ${workspaceIdParam}
      AND event_type = 'track'
      AND user_or_anonymous_id = ${userIdParam}
      ${journeyClause}
      ${templateClause}
      ${triggeringMessageIdClause}
      ${messageIdClause}
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
}: SearchDeliveriesRequest): Promise<SearchDeliveriesResponse> {
  const offset = parseCursorOffset(cursor);
  const queryBuilder = new ClickHouseQueryBuilder();
  const workspaceIdParam = queryBuilder.addQueryValue(workspaceId, "String");
  const eventList = queryBuilder.addQueryValue(EmailEventList, "Array(String)");
  const journeyIdClause = journeyId
    ? `AND JSONExtractString(properties, 'journeyId') = ${queryBuilder.addQueryValue(
        journeyId,
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
  const templateIdClause = templateIds
    ? `AND JSON_VALUE(properties, '$.templateId') IN ${queryBuilder.addQueryValue(
        templateIds,
        "Array(String)",
      )}`
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
    withClauses.length > 0 ? `WITH ${withClauses.join(", ")}` : "";

  const query = `
    ${withClause}
    SELECT
      argMax(event, event_time) last_event,
      anyIf(properties, properties != '') properties,
      max(event_time) updated_at,
      min(event_time) sent_at,
      user_or_anonymous_id,
      origin_message_id,
      any(triggering_message_id) as triggering_message_id,
      workspace_id
    FROM (
      SELECT
        workspace_id,
        user_or_anonymous_id,
        if(event = 'DFInternalMessageSent', JSONExtractString(message_raw, 'properties'), '') properties,
        event,
        event_time,
        if(event = '${
          InternalEventType.MessageSent
        }', message_id, JSON_VALUE(message_raw, '$.properties.messageId')) origin_message_id,
        if(event = '${
          InternalEventType.MessageSent
        }', JSON_VALUE(message_raw, '$.properties.triggeringMessageId'), '') triggering_message_id
      FROM user_events_v2
      WHERE
        event in ${eventList}
        AND workspace_id = ${workspaceIdParam}
        ${channelClause}
        ${toClause}
        ${fromClause}
        ${templateIdClause}
        ${startDateClause}
        ${endDateClause}
        ${groupIdClause}
    ) AS inner
    GROUP BY workspace_id, user_or_anonymous_id, origin_message_id
    HAVING
      origin_message_id != ''
      AND properties != ''
      ${journeyIdClause}
      ${userIdClause}
      ${statusClause}
    ORDER BY ${sortByClause}
    LIMIT ${queryBuilder.addQueryValue(
      offset,
      "UInt64",
    )},${queryBuilder.addQueryValue(limit, "UInt64")}
  `;

  const result = await chQuery({
    query,
    query_params: queryBuilder.getQueries(),
    format: "JSONEachRow",
    clickhouse_settings: {
      date_time_output_format: "iso",
    },
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
