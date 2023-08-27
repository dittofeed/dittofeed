import { Readable } from "node:stream";

import { ClickHouseClient, createClient } from "@clickhouse/client";
import { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/client";
import { v4 as uuid } from "uuid";

import config from "./config";
import logger from "./logger";

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

export interface CreateConfigParams {
  enableSession?: boolean;
}

function getClientConfig({
  enableSession = false,
}: CreateConfigParams): NodeClickHouseClientConfigOptions {
  const {
    clickhouseHost: host,
    clickhouseDatabase: database,
    clickhouseUser: username,
    clickhousePassword: password,
  } = config();

  const clientConfig: NodeClickHouseClientConfigOptions = {
    host,
    database,
    username,
    password,
    clickhouse_settings: {
      date_time_input_format: "best_effort",
    },
  };
  if (enableSession) {
    const sessionId = getChCompatibleUuid();
    logger().info(`ClickHouse session ID: ${sessionId}`);
    clientConfig.session_id = sessionId;
  }
  return clientConfig;
}

export async function createClickhouseDb(
  createConfigParams: CreateConfigParams = {}
) {
  const { clickhouseDatabase: database } = config();

  const clientConfig = getClientConfig(createConfigParams);
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

export function createClickhouseClient(
  createConfigParams: CreateConfigParams = {}
) {
  const clientConfig = getClientConfig(createConfigParams);
  return createClient(clientConfig);
}

let CLICKHOUSE_CLIENT: ClickHouseClient<Readable> | null = null;

export function clickhouseClient() {
  if (CLICKHOUSE_CLIENT === null) {
    CLICKHOUSE_CLIENT = createClickhouseClient();
  }
  return CLICKHOUSE_CLIENT;
}
