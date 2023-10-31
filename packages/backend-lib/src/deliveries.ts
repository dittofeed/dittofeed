import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  streamClickhouseQuery,
} from "./clickhouse";
import {
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

  const tableVersion = await getTableVersion({ workspaceId });
  const query = `SELECT * FROM ${buildUserEventsTableName(
    tableVersion
  )} WHERE workspace_id = ${workspaceIdParam}`;

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
