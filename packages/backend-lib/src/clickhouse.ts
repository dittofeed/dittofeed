import {
  ClickHouseClientConfigOptions,
  createClient,
} from "@clickhouse/client";

import config from "./config";

const {
  clickhouseHost: host,
  clickhouseDatabase: database,
  clickhouseUsername: username,
  clickhousePassword: password,
} = config();

function getClientConfig(): ClickHouseClientConfigOptions {
  return {
    host,
    database,
    username,
    password,
    clickhouse_settings: {
      date_time_input_format: "best_effort",
    },
  };
}

export async function createClickhouseDb() {
  const clientConfig = getClientConfig();
  clientConfig.database = undefined;

  const client = createClient(clientConfig);

  await client.exec({
    query: "CREATE DATABASE IF NOT EXISTS dittofeed",
    clickhouse_settings: {
      wait_end_of_query: 1,
    },
  });
}

export const clickhouseClient = createClient(getClientConfig());
