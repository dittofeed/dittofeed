import { Static, Type } from "@sinclair/typebox";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";

import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  streamClickhouseQuery,
} from "./clickhouse";
import logger from "./logger";
import {
  EmailEventList,
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
});

type SearchDeliveryRow = Static<typeof SearchDeliveryRow>;

export async function searchDeliveries({
  workspaceId,
}: SearchDeliveriesRequest): Promise<SearchDeliveriesResponse> {
  const queryBuilder = new ClickHouseQueryBuilder();
  const workspaceIdParam = queryBuilder.addQueryValue(workspaceId, "String");
  const eventList = queryBuilder.addQueryValue(EmailEventList, "Array(String)");
  const tableVersion = await getTableVersion({ workspaceId });
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
        JSON_VALUE(message_raw, '$.properties.messageId') origin_message_id
      FROM ${buildUserEventsTableName(tableVersion)} 
      WHERE
        event in ${eventList}
        AND workspace_id = ${workspaceIdParam}
    ) AS inner
    GROUP BY workspace_id, user_or_anonymous_id, origin_message_id
    ORDER BY sent_at DESC
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
      const itemResult = schemaValidateWithErr(
        {
          sentAt: parsed.sent_at,
          updatedAt: parsed.updated_at,
          status: parsed.last_event,
          ...properties,
        },
        SearchDeliveriesResponseItem
      );

      if (itemResult.isErr()) {
        logger().error(
          {
            err: itemResult.error,
          },
          "Failed to parse delivery item from clickhouse"
        );
        continue;
      }
      items.push(itemResult.value);
    }
  });

  return {
    workspaceId,
    items,
  };
}
