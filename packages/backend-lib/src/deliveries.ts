import { Static, Type } from "@sinclair/typebox";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";

import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  streamClickhouseQuery,
} from "./clickhouse";
import logger from "./logger";
import { deserializeCursor, serializeCursor } from "./pagination";
import {
  EmailEventList,
  InternalEventType,
  SearchDeliveriesRequest,
  SearchDeliveriesResponse,
  SearchDeliveriesResponseItem,
} from "./types";
import { getTableVersion } from "./userEvents";
import { buildUserEventsTableName } from "./userEvents/clickhouse";

const SearchDeliveryRow = Type.Object({
  last_event: Type.String(),
  properties: Type.String(),
  updated_at: Type.String(),
  sent_at: Type.String(),
  origin_message_id: Type.String(),
  workspace_id: Type.String(),
  user_or_anonymous_id: Type.String(),
});

type SearchDeliveryRow = Static<typeof SearchDeliveryRow>;

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
      "Failed to parse deliveries cursor"
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

export async function searchDeliveries({
  workspaceId,
  cursor,
  limit = 20,
  journeyId,
}: SearchDeliveriesRequest): Promise<SearchDeliveriesResponse> {
  const offset = parseCursorOffset(cursor);
  const queryBuilder = new ClickHouseQueryBuilder();
  const workspaceIdParam = queryBuilder.addQueryValue(workspaceId, "String");
  const eventList = queryBuilder.addQueryValue(EmailEventList, "Array(String)");
  const tableVersion = await getTableVersion({ workspaceId });
  const journeyIdClause = journeyId
    ? `AND JSONExtractString(properties, 'journeyId') = ${queryBuilder.addQueryValue(
        journeyId,
        "String"
      )}`
    : "";
  const query = `
    SELECT 
      argMax(event, event_time) last_event,
      argMax(properties, if(empty(properties), 0, toUnixTimestamp(event_time))) properties,
      max(event_time) updated_at,
      min(event_time) sent_at,
      user_or_anonymous_id,
      origin_message_id,
      workspace_id
    FROM (
      SELECT
        workspace_id,
        user_or_anonymous_id,
        JSONExtractString(message_raw, 'properties') properties,
        event,
        event_time,
        if(event = '${
          InternalEventType.MessageSent
        }', message_id, JSON_VALUE(message_raw, '$.properties.messageId')) origin_message_id
      FROM ${buildUserEventsTableName(tableVersion)} 
      WHERE
        event in ${eventList}
        AND workspace_id = ${workspaceIdParam}
    ) AS inner
    GROUP BY workspace_id, user_or_anonymous_id, origin_message_id
    HAVING
      origin_message_id != ''
      ${journeyIdClause}
    ORDER BY sent_at DESC
    LIMIT ${queryBuilder.addQueryValue(
      offset,
      "UInt64"
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
      const parsed = unwrap(schemaValidateWithErr(row, SearchDeliveryRow));
      const properties = parsed.properties.length
        ? (JSON.parse(parsed.properties) as Record<string, unknown>)
        : {};
      const unvalidatedItem = {
        sentAt: parsed.sent_at,
        updatedAt: parsed.updated_at,
        status: parsed.last_event,
        originMessageId: parsed.origin_message_id,
        userId: parsed.user_or_anonymous_id,
        ...properties,
      };

      const itemResult = schemaValidateWithErr(
        unvalidatedItem,
        SearchDeliveriesResponseItem
      );

      if (itemResult.isErr()) {
        logger().error(
          {
            unvalidatedItem,
            err: itemResult.error,
          },
          "Failed to parse delivery item from clickhouse"
        );
        continue;
      }
      items.push(itemResult.value);
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
