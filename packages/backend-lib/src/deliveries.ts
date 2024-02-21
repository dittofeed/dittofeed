import { Static, Type } from "@sinclair/typebox";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { omit } from "remeda";

import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  streamClickhouseQuery,
} from "./clickhouse";
import logger from "./logger";
import { deserializeCursor, serializeCursor } from "./pagination";
import {
  ChannelType,
  EmailEventList,
  InternalEventType,
  SearchDeliveriesRequest,
  SearchDeliveriesResponse,
  SearchDeliveriesResponseItem,
} from "./types";

export const SearchDeliveryRow = Type.Object({
  last_event: Type.String(),
  properties: Type.String(),
  updated_at: Type.String(),
  sent_at: Type.String(),
  origin_message_id: Type.String(),
  workspace_id: Type.String(),
  user_or_anonymous_id: Type.String(),
});

export type SearchDeliveryRow = Static<typeof SearchDeliveryRow>;

const OffsetKey = "o" as const;

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
      userId: row.user_or_anonymous_id,
      channel:
        properties.channnel ?? properties.messageType ?? ChannelType.Email,
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

export async function searchDeliveries({
  workspaceId,
  cursor,
  limit = 20,
  journeyId,
  userId,
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
  const userIdClause = userId
    ? `AND user_or_anonymous_id = ${queryBuilder.addQueryValue(
        userId,
        "String",
      )}`
    : "";
  const query = `
    SELECT 
      argMax(event, event_time) last_event,
      any(if(properties = '', NULL, properties)) properties,
      max(event_time) updated_at,
      min(event_time) sent_at,
      user_or_anonymous_id,
      origin_message_id,
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
        }', message_id, JSON_VALUE(message_raw, '$.properties.messageId')) origin_message_id
      FROM user_events_v2
      WHERE
        event in ${eventList}
        AND workspace_id = ${workspaceIdParam}
    ) AS inner
    GROUP BY workspace_id, user_or_anonymous_id, origin_message_id
    HAVING
      origin_message_id != ''
      ${journeyIdClause}
      ${userIdClause}
    ORDER BY sent_at DESC
    LIMIT ${queryBuilder.addQueryValue(
      offset,
      "UInt64",
    )},${queryBuilder.addQueryValue(limit, "UInt64")}
  `;

  const result = await clickhouseClient().query({
    query,
    query_params: queryBuilder.getQueries(),
    format: "JSONEachRow",
  });

  const items: SearchDeliveriesResponseItem[] = [];
  await streamClickhouseQuery(result, (rows) => {
    for (const row of rows) {
      const parsedRow = unwrap(schemaValidateWithErr(row, SearchDeliveryRow));
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
    previousOffset > 0 ? serializeCursorOffset(previousOffset) : undefined;

  return {
    workspaceId,
    items,
    cursor: responseCursor,
    previousCursor: responsePreviousCursor,
  };
}
