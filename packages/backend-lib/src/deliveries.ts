import { Static, Type } from "@sinclair/typebox";
import {
  jsonParseSafe,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
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
  GetDeliveryBodyRequest,
  InternalEventType,
  MessageSendSuccessContents,
  MessageSendSuccessVariant,
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
  triggering_message_id: Type.Optional(Type.String()),
  workspace_id: Type.String(),
  user_or_anonymous_id: Type.String(),
});

export type SearchDeliveryRow = Static<typeof SearchDeliveryRow>;

const MessageProperties = Type.Record(Type.String(), Type.Any());

type MessageProperties = Static<typeof MessageProperties>;

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

export async function getMessageFromInternalMessageSent({
  workspaceId,
  messageId,
}: {
  workspaceId: string;
  messageId: string;
}): Promise<{ properties: MessageProperties; userId: string } | null> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const messageIdParam = qb.addQueryValue(messageId, "String");
  const query = `
    SELECT
      properties,
      user_or_anonymous_id
    FROM user_events_v2
    WHERE
      event = '${InternalEventType.MessageSent}'
      AND workspace_id = ${workspaceIdParam}
      AND event_type = 'track'
      AND message_id = ${messageIdParam}
    ORDER BY processing_time DESC
    LIMIT 1
  `;
  const result = await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
    format: "JSONEachRow",
  });
  const results = await result.json();
  const delivery = results[0] as
    | { properties: string; user_or_anonymous_id: string }
    | undefined;
  if (!delivery) {
    return null;
  }
  const propertiesResult = jsonParseSafe(delivery.properties);
  if (propertiesResult.isErr()) {
    return null;
  }
  const parsedResult = schemaValidateWithErr(
    propertiesResult.value,
    MessageProperties,
  ).unwrapOr(null);

  if (!parsedResult) {
    return null;
  }

  return {
    properties: parsedResult,
    userId: delivery.user_or_anonymous_id,
  };
}

export async function searchDeliveries({
  workspaceId,
  cursor,
  limit = 20,
  journeyId,
  channels,
  userId,
  to,
  from,
  statuses,
  templateIds,
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

  const query = `
    SELECT 
      argMax(event, event_time) last_event,
      any(if(properties = '', NULL, properties)) properties,
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
    ) AS inner
    GROUP BY workspace_id, user_or_anonymous_id, origin_message_id
    HAVING
      origin_message_id != ''
      ${journeyIdClause}
      ${userIdClause}
      ${statusClause}
    ORDER BY sent_at DESC, origin_message_id ASC
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
    previousOffset > 0 ? serializeCursorOffset(previousOffset) : undefined;

  return {
    workspaceId,
    items,
    cursor: responseCursor,
    previousCursor: responsePreviousCursor,
  };
}
