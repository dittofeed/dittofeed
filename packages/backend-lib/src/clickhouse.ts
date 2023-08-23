import { ClickHouseClient, createClient } from "@clickhouse/client";
import { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/client";
import { v4 as uuid } from "uuid";

import config from "./config";

export function getChCompatibleUuid() {
  return uuid().replace(/-/g, "_");
}

export class ClickHouseQueryBuilder {
  private queries: Record<string, unknown>;

  constructor() {
    this.queries = {};
  }

  getQueries() {
    return this.queries;
  }

  addQueryValue(value: unknown, dataType: string): string {
    const id = getChCompatibleUuid();
    this.queries[id] = value;
    return `{${id}:${dataType}}`;
  }
}

function getClientConfig(): NodeClickHouseClientConfigOptions {
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
