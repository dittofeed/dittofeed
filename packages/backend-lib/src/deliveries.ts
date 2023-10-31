import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  streamClickhouseQuery,
} from "./clickhouse";
import {
  EmailEventList,
  SearchDeliveriesRequest,
  SearchDeliveriesResponse,
  SearchDeliveriesResponseItem,
} from "./types";
import { getTableVersion } from "./userEvents";
import { buildUserEventsTableName } from "./userEvents/clickhouse";

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
  // FIXME properties not working

  const result = await clickhouseClient().query({
    query,
    query_params: queryBuilder.getQueries(),
    format: "JSONEachRow",
  });

  const items: SearchDeliveriesResponseItem[] = [];
  await streamClickhouseQuery(result, (rows) => {
    for (const row of rows) {
      items.push(row as SearchDeliveriesResponseItem);
    }
  });

  return {
    workspaceId,
    items,
  };
}
