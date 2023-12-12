import { Readable } from "node:stream";

import {
  BaseResultSet,
  ClickHouseClient,
  createClient,
  Row,
} from "@clickhouse/client";
import { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/client";
import { v4 as uuid } from "uuid";

import config from "./config";
import logger from "./logger";

export function getChCompatibleUuid() {
  return uuid().replace(/-/g, "_");
}

/**
 * Class to build ClickHouse queries.
 */
export class ClickHouseQueryBuilder {
  private queries: Record<string, unknown>;

  private debug: boolean;

  /**
   * Constructs a new ClickHouseQueryBuilder.
   *
   * @param {Object} params - The constructor parameters.
   * @param {boolean} params.debug - Whether to enable debug mode. In this mode
   * values will not be sanitized, but will be rendered directly. Should not be
   * used in production. Defaults to false.
   */
  constructor({ debug }: { debug?: boolean } = { debug: false }) {
    this.debug = debug ?? false;
    this.queries = {};
  }

  /**
   * Returns the current queries.
   *
   * @returns {Record<string, unknown>} The current queries.
   */
  getQueries() {
    return this.queries;
  }

  /**
   * Adds a value to the queries.
   *
   * @param {unknown} value - The value to add.
   * @param {string} dataType - The data type of the value.
   * @returns {string} The ID of the added value.
   */
  addQueryValue(value: unknown, dataType: string): string {
    if (this.debug) {
      switch (dataType) {
        case "String":
          return `'${value}'`;
        case "Int32":
          return `${value}`;
        case "Array(String)":
          if (Array.isArray(value)) {
            return `['${value.join("','")}']`;
          }
          return `['${value}']`;
        default:
          throw new Error(
            `Unhandled data type in query builder debug mode: ${dataType}`
          );
      }
    }
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

export async function streamClickhouseQuery(
  query: BaseResultSet<Readable>,
  cb: (rows: unknown[]) => Promise<void> | void
): Promise<void> {
  const stream = query.stream();
  const rowPromises: Promise<unknown>[] = [];

  stream.on("data", (rows: Row[]) => {
    const promise = (async () => {
      const json = await Promise.all(rows.map((row) => row.json()));
      await cb(json);
    })();
    rowPromises.push(promise);
  });

  await Promise.all([
    new Promise((resolve) => {
      stream.on("end", () => {
        resolve(0);
      });
    }),
    ...rowPromises,
  ]);
}

export function clickhouseDateToIso(dateString: string): string {
  return `${dateString.replace(" ", "T")}Z`;
}

export async function command(
  params: Parameters<ClickHouseClient["command"]>[0],
  {
    clickhouseClient: client = clickhouseClient(),
  }: {
    clickhouseClient?: ClickHouseClient<Readable>;
  } = {}
): Promise<ReturnType<ClickHouseClient["command"]>> {
  const queryId = params.query_id ?? getChCompatibleUuid();
  try {
    logger().debug({ queryId, params }, "Executing ClickHouse command.");
    return client.command({ query_id: queryId, ...params });
  } catch (e) {
    logger().error({ queryId, params, error: e }, "ClickHouse command failed.");
    throw e;
  }
}
