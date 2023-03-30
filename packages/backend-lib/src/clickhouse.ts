import {
  ClickHouseClient,
  ClickHouseClientConfigOptions,
  createClient,
} from "@clickhouse/client";
import { v4 as uuid } from "uuid";

import config from "./config";

export function getChCompatibleUuid(existing?: string) {
  return (existing ?? uuid()).replace(/-/g, "_");
}

function getClientConfig(): ClickHouseClientConfigOptions {
  const {
    clickhouseHost: host,
    clickhouseDatabase: database,
    clickhouseUser: username,
    clickhousePassword: password,
  } = config();

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
  const { clickhouseDatabase: database } = config();

  const clientConfig = getClientConfig();
  clientConfig.database = undefined;

  const client = createClient(clientConfig);

  await client.exec({
    query: `CREATE DATABASE IF NOT EXISTS ${database}`,
    clickhouse_settings: {
      wait_end_of_query: 1,
    },
  });
  await client.close();
}

let CLICKHOUSE_CLIENT: ClickHouseClient | null = null;

export function clickhouseClient() {
  if (CLICKHOUSE_CLIENT === null) {
    CLICKHOUSE_CLIENT = createClient(getClientConfig());
  }
  return CLICKHOUSE_CLIENT;
}
