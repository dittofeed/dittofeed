import { Readable } from "node:stream";

import {
  BaseResultSet,
  ClickHouseClient,
  createClient,
  Row,
} from "@clickhouse/client";
import { NodeClickHouseClient } from "@clickhouse/client/dist/client";
import { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/config";
import { v4 as uuid } from "uuid";

import config from "./config";
import logger from "./logger";
import { withSpan } from "./openTelemetry";

export function getChCompatibleUuid() {
  return uuid().replace(/-/g, "_");
}

/**
 * Class to build ClickHouse queries.
 */
export class ClickHouseQueryBuilder {
  private queries: Map<string, unknown>;

  private variableCount: number;

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
    this.variableCount = 0;
    this.queries = new Map();
  }

  /**
   * Returns the current queries.
   *
   * @returns {Record<string, unknown>} The current queries.
   */
  getQueries(): Record<string, unknown> {
    return Object.fromEntries(this.queries);
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
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          return `'${value}'`;
        case "Int32":
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          return `${value}`;
        case "Array(String)":
          if (Array.isArray(value)) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            return `['${value.join("','")}']`;
          }
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          return `['${value}']`;
        case "Int64":
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          return `${value}`;
        case "Float64":
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          return `${value}`;
        case "UInt64":
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          return `${value}`;
        default:
          throw new Error(
            `Unhandled data type in query builder debug mode: ${dataType}`,
          );
      }
    }
    const id = `v${this.queries.size}`;
    this.queries.set(id, value);
    return `{${id}:${dataType}}`;
  }

  /**
   *
   * @returns {string} A clickhouse safe variable name.
   */
  getVariableName(): string {
    const variable = `vn${this.variableCount}`;
    this.variableCount += 1;
    return variable;
  }
}

export interface CreateConfigParams {
  enableSession?: boolean;
  requestTimeout?: number;
  maxBytesRatioBeforeExternalGroupBy?: number;
  maxBytesBeforeExternalGroupBy?: string;
  host?: string;
  database?: string;
  user?: string;
  password?: string;
}

function getClientConfig({
  enableSession = false,
  requestTimeout = 180000,
  maxBytesRatioBeforeExternalGroupBy: maxBytesRatioBeforeExternalGroupByParam,
  maxBytesBeforeExternalGroupBy: maxBytesBeforeExternalGroupByParam,
  host: paramsHost,
  database: paramsDatabase,
  user: paramsUser,
  password: paramsPassword,
}: CreateConfigParams): NodeClickHouseClientConfigOptions {
  const {
    clickhouseHost: configHost,
    clickhouseDatabase: configDatabase,
    clickhouseUser: configUser,
    clickhousePassword: configPassword,
    clickhouseMaxExecutionTime,
    clickhouseMaxMemoryUsage,
  } = config();

  const url = paramsHost ?? configHost;
  const database = paramsDatabase ?? configDatabase;
  const username = paramsUser ?? configUser;
  const password = paramsPassword ?? configPassword;

  const maxBytesRatioBeforeExternalGroupBy =
    maxBytesRatioBeforeExternalGroupByParam ??
    config().clickhouseMaxBytesRatioBeforeExternalGroupBy;
  const maxBytesBeforeExternalGroupBy =
    maxBytesBeforeExternalGroupByParam ??
    config().clickhouseMaxBytesBeforeExternalGroupBy;

  const clientConfig: NodeClickHouseClientConfigOptions = {
    url,
    database,
    username,
    password,
    request_timeout: requestTimeout,
    clickhouse_settings: {
      max_bytes_ratio_before_external_group_by:
        maxBytesRatioBeforeExternalGroupBy,
      max_bytes_before_external_group_by: maxBytesBeforeExternalGroupBy,
      date_time_input_format: "best_effort",
      max_execution_time: clickhouseMaxExecutionTime,
      max_memory_usage: clickhouseMaxMemoryUsage,
    },
  };
  logger().debug({ clientConfig }, "ClickHouse client config");
  if (enableSession) {
    const sessionId = getChCompatibleUuid();
    logger().info(
      {
        sessionId,
      },
      "ClickHouse session ID",
    );
    clientConfig.session_id = sessionId;
  }
  return clientConfig;
}

export async function createClickhouseDb(
  createConfigParams: CreateConfigParams = {},
) {
  const { clickhouseDatabase: database } = config();

  const clientConfig = getClientConfig(createConfigParams);
  clientConfig.database = undefined;

  const client = createClient(clientConfig);

  logger().info(
    {
      database,
    },
    "Creating ClickHouse database",
  );
  await client.exec({
    query: `CREATE DATABASE IF NOT EXISTS ${database}`,
    clickhouse_settings: {
      wait_end_of_query: 1,
    },
  });
  await client.close();
}

export function createClickhouseClient(
  createConfigParams: CreateConfigParams = {},
) {
  const clientConfig = getClientConfig(createConfigParams);
  return createClient(clientConfig);
}

let CLICKHOUSE_CLIENT: NodeClickHouseClient | null = null;

export function clickhouseClient() {
  if (CLICKHOUSE_CLIENT === null) {
    CLICKHOUSE_CLIENT = createClickhouseClient();
  }
  return CLICKHOUSE_CLIENT;
}

export async function streamClickhouseQuery(
  q: BaseResultSet<Readable, "JSONEachRow">,
  cb: (rows: unknown[]) => Promise<void> | void,
): Promise<void> {
  const stream = q.stream();
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

const LIGHTWEIGHT_DELETES_SYNC_SETTING = "lightweight_deletes_sync";
const UNKNOWN_SETTING_ERROR_CODE = 115;

// `lightweight_deletes_sync` was added in ClickHouse 24.8. Older servers reject
// it with UNKNOWN_SETTING, which would make every delete fail. Track whether the
// server understands the setting so it only has to be stripped once.
let lightweightDeletesSyncSupported: boolean | null = null;

/**
 * Removes the `lightweight_deletes_sync` setting from a sql statement, for
 * ClickHouse servers that predate it. Statements that don't reference the
 * setting are returned untouched.
 */
export function stripUnsupportedClickhouseSettings(statement: string): string {
  if (!statement.includes(LIGHTWEIGHT_DELETES_SYNC_SETTING)) {
    return statement;
  }
  const withoutSetting = statement
    // trailing setting: `mutations_sync = 0, lightweight_deletes_sync = 0`
    .replace(/\s*,\s*lightweight_deletes_sync\s*=\s*[^,;\s]+\s*/gi, "")
    // leading setting: `lightweight_deletes_sync = 0, mutations_sync = 0`
    .replace(/\blightweight_deletes_sync\s*=\s*[^,;\s]+\s*,\s*/gi, "")
    // the setting is the only one
    .replace(/\s*lightweight_deletes_sync\s*=\s*[^,;\s]+/gi, "");
  // a settings clause left without any settings is invalid sql
  return withoutSetting.replace(/\s+settings\s*;?\s*$/i, ";");
}

export function isUnsupportedClickhouseSettingsError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  if (
    !("message" in error) ||
    typeof error.message !== "string" ||
    !error.message.includes(LIGHTWEIGHT_DELETES_SYNC_SETTING)
  ) {
    return false;
  }
  if (
    "code" in error &&
    String(error.code) === String(UNKNOWN_SETTING_ERROR_CODE)
  ) {
    return true;
  }
  return "type" in error && error.type === "UNKNOWN_SETTING";
}

export function resetClickhouseSettingsSupportCache(): void {
  lightweightDeletesSyncSupported = null;
}

/**
 * Executes a sql statement, degrading gracefully when the ClickHouse server is
 * too old to understand `lightweight_deletes_sync`. The unsupported setting is
 * stripped and the statement is retried once, and the outcome is cached so
 * later statements skip it up front.
 */
export async function executeWithSettingsFallback<T>({
  statement: rawStatement,
  queryId,
  execute,
}: {
  statement: string;
  queryId: string;
  execute: (statement: string) => Promise<T>;
}): Promise<T> {
  const statement =
    lightweightDeletesSyncSupported === false
      ? stripUnsupportedClickhouseSettings(rawStatement)
      : rawStatement;
  try {
    return await execute(statement);
  } catch (error) {
    const strippedStatement = stripUnsupportedClickhouseSettings(statement);
    if (
      strippedStatement === statement ||
      !isUnsupportedClickhouseSettingsError(error)
    ) {
      throw error;
    }
    lightweightDeletesSyncSupported = false;
    logger().warn(
      { err: error, queryId },
      "clickhouse server does not support lightweight_deletes_sync, retrying without it",
    );
    return execute(strippedStatement);
  }
}

export async function command(
  params: Parameters<ClickHouseClient["command"]>[0],
  {
    clickhouseClient: client = clickhouseClient(),
  }: {
    clickhouseClient?: NodeClickHouseClient;
    queryId?: string;
  } = {},
): Promise<ReturnType<ClickHouseClient["command"]>> {
  const queryId = params.query_id ?? getChCompatibleUuid();
  return withSpan({ name: "clickhouse-command" }, async (span) => {
    span.setAttributes({ queryId, query: params.query });
    logger().trace(
      {
        queryId,
        query: params.query,
      },
      "clickhouse-command",
    );
    try {
      return await executeWithSettingsFallback({
        statement: params.query,
        queryId,
        execute: (statement) =>
          client.command({ query_id: queryId, ...params, query: statement }),
      });
    } catch (error) {
      logger().error(
        { err: error, queryId },
        "Error executing clickhouse command",
      );
      throw error;
    }
  });
}

export async function query(
  params: Parameters<ClickHouseClient["query"]>[0],
  {
    clickhouseClient: client = clickhouseClient(),
  }: {
    clickhouseClient?: NodeClickHouseClient;
    queryId?: string;
  } = {},
): Promise<BaseResultSet<Readable, "JSONEachRow">> {
  const queryId = params.query_id ?? getChCompatibleUuid();
  return withSpan({ name: "clickhouse-query" }, async (span) => {
    span.setAttributes({ queryId, query: params.query });
    logger().trace(
      {
        queryId,
        query: params.query,
      },
      "clickhouse-query",
    );
    try {
      return await executeWithSettingsFallback({
        statement: params.query,
        queryId,
        execute: (statement) =>
          client.query<"JSONEachRow">({
            query_id: queryId,
            ...params,
            query: statement,
            format: "JSONEachRow",
          }),
      });
    } catch (error) {
      logger().error(
        { err: error, queryId },
        "Error executing clickhouse query",
      );
      throw error;
    }
  });
}
