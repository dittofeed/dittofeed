import { command, createClickhouseClient, query } from "../clickhouse";
import config from "../config";
import logger from "../logger";

export const DEFAULT_REPLICATED_TABLE_PATH_PREFIX =
  "/clickhouse/tables/{shard}";

export function isReplicatedTableEngine(engine: string): boolean {
  return engine.startsWith("Replicated");
}

export function getReplicatedMergeTreeEngine(tableName: string): string {
  const pathPrefix =
    config().clickhouseReplicatedTablePathPrefix ??
    DEFAULT_REPLICATED_TABLE_PATH_PREFIX;
  return `ReplicatedMergeTree('${pathPrefix}/${tableName}', '{replica}')`;
}

export function getReplicatedReplacingMergeTreeEngine({
  tableName,
  versionColumn,
}: {
  tableName: string;
  versionColumn?: string;
}): string {
  const pathPrefix =
    config().clickhouseReplicatedTablePathPrefix ??
    DEFAULT_REPLICATED_TABLE_PATH_PREFIX;
  const versionArg = versionColumn ? `, ${versionColumn}` : "";
  return `ReplicatedReplacingMergeTree('${pathPrefix}/${tableName}', '{replica}'${versionArg})`;
}

export function getMergeTreeEngine(tableName: string): string {
  if (config().clickhouseUseReplicatedTables === false) {
    return "MergeTree()";
  }
  if (config().clickhouseUseReplicatedTables === true) {
    return getReplicatedMergeTreeEngine(tableName);
  }
  return "MergeTree()";
}

let replicationMacrosCache: boolean | null = null;

export async function hasReplicationMacros(): Promise<boolean> {
  if (replicationMacrosCache !== null) {
    return replicationMacrosCache;
  }

  try {
    const result = await query({
      query: `
        SELECT count() AS count
        FROM system.macros
        WHERE macro IN ('shard', 'replica')
      `,
    });
    const rows = await result.json<{ count: string }>();
    replicationMacrosCache = Number(rows[0]?.count ?? 0) >= 2;
    return replicationMacrosCache;
  } catch (error) {
    logger().warn(
      { err: error },
      "Failed to detect ClickHouse replication macros",
    );
    replicationMacrosCache = false;
    return false;
  }
}

export async function resolveMergeTreeEngine(
  tableName: string,
): Promise<string> {
  if (config().clickhouseUseReplicatedTables === false) {
    return "MergeTree()";
  }
  if (
    config().clickhouseUseReplicatedTables === true ||
    (await hasReplicationMacros())
  ) {
    return getReplicatedMergeTreeEngine(tableName);
  }
  return "MergeTree()";
}

export async function resolveReplacingMergeTreeEngine({
  tableName,
  versionColumn,
}: {
  tableName: string;
  versionColumn?: string;
}): Promise<string> {
  const versionArg = versionColumn ? `(${versionColumn})` : "()";
  if (config().clickhouseUseReplicatedTables === false) {
    return `ReplacingMergeTree${versionArg}`;
  }
  if (
    config().clickhouseUseReplicatedTables === true ||
    (await hasReplicationMacros())
  ) {
    return getReplicatedReplacingMergeTreeEngine({ tableName, versionColumn });
  }
  return `ReplacingMergeTree${versionArg}`;
}

export async function resolveOnClusterClause(): Promise<string> {
  if (config().clickhouseUseReplicatedTables === false) {
    return "";
  }

  try {
    const result = await query({
      query: "SELECT getMacro('cluster') AS cluster",
    });
    const rows = await result.json<{ cluster: string }>();
    const cluster = rows[0]?.cluster;
    if (!cluster) {
      return "";
    }
    if (!/^[A-Za-z0-9_-]+$/.test(cluster)) {
      logger().warn({ cluster }, "Ignoring unsafe ClickHouse cluster macro");
      return "";
    }
    return ` ON CLUSTER ${cluster}`;
  } catch (error) {
    logger().warn({ err: error }, "Failed to resolve ClickHouse cluster macro");
    return "";
  }
}

export async function getClickhouseClusterHttpHosts(): Promise<string[]> {
  const result = await query({
    query: `
      SELECT DISTINCT host_name
      FROM system.clusters
      WHERE cluster = getMacro('cluster')
      ORDER BY host_name
    `,
  });
  const rows = await result.json<{ host_name: string }>();
  if (rows.length === 0) {
    return [config().clickhouseHost];
  }

  const configuredHost = new URL(config().clickhouseHost);
  const namespace = configuredHost.hostname.includes(".")
    ? configuredHost.hostname.split(".").slice(1).join(".")
    : "dittofeed.svc.cluster.local";
  const port = configuredHost.port || "8123";
  const protocol = configuredHost.protocol || "http:";

  return rows.map(
    ({ host_name }) => `${protocol}//${host_name}.${namespace}:${port}`,
  );
}

export async function getTableEngine(
  tableName: string,
): Promise<string | null> {
  const result = await query({
    query: `
      SELECT engine
      FROM system.tables
      WHERE database = currentDatabase()
        AND name = {tableName:String}
    `,
    query_params: { tableName },
  });
  const rows = await result.json<{ engine: string }>();
  return rows[0]?.engine ?? null;
}

export async function getTableRowCount(
  tableName: string,
  host?: string,
): Promise<number> {
  const client = host ? createClickhouseClient({ host }) : undefined;
  const result = await query(
    {
      query: `SELECT count() AS count FROM ${tableName}`,
      clickhouse_settings: { max_execution_time: 120 },
    },
    client ? { clickhouseClient: client } : undefined,
  );
  const rows = await result.json<{ count: string }>();
  return Number(rows[0]?.count ?? 0);
}

export interface MigrateMergeTreeToReplicatedParams {
  tableName: string;
  buildCreateTableQuery: (engine: string) => string;
  materializedViewName?: string;
  buildCreateMaterializedViewQuery?: () => string;
}

function buildTempTableQuery(
  buildCreateTableQuery: (engine: string) => string,
  tableName: string,
  tempTableName: string,
  engine: string,
): string {
  return buildCreateTableQuery(engine)
    .replace(
      `CREATE TABLE IF NOT EXISTS ${tableName}`,
      `CREATE TABLE ${tempTableName}`,
    )
    .replace(
      `create table if not exists ${tableName}`,
      `CREATE TABLE ${tempTableName}`,
    );
}

async function dropMaterializedView(
  materializedViewName: string | undefined,
  host?: string,
) {
  if (!materializedViewName) {
    return;
  }
  const client = host ? createClickhouseClient({ host }) : undefined;
  await command(
    {
      query: `DROP TABLE IF EXISTS ${materializedViewName}`,
      clickhouse_settings: { wait_end_of_query: 1 },
    },
    client ? { clickhouseClient: client } : undefined,
  );
}

async function createMaterializedView(
  buildCreateMaterializedViewQuery: (() => string) | undefined,
  host?: string,
) {
  if (!buildCreateMaterializedViewQuery) {
    return;
  }
  const client = host ? createClickhouseClient({ host }) : undefined;
  await command(
    {
      query: buildCreateMaterializedViewQuery(),
      clickhouse_settings: { wait_end_of_query: 1 },
    },
    client ? { clickhouseClient: client } : undefined,
  );
}

async function migratePrimaryReplica({
  tableName,
  buildCreateTableQuery,
  materializedViewName,
  buildCreateMaterializedViewQuery,
  host,
}: MigrateMergeTreeToReplicatedParams & { host?: string }) {
  const client = host ? createClickhouseClient({ host }) : undefined;
  const tempTableName = `${tableName}_replicated_migration`;
  const replicatedEngine = getReplicatedMergeTreeEngine(tableName);

  await dropMaterializedView(materializedViewName, host);

  await command(
    {
      query: `DROP TABLE IF EXISTS ${tempTableName}`,
      clickhouse_settings: { wait_end_of_query: 1 },
    },
    client ? { clickhouseClient: client } : undefined,
  );

  await command(
    {
      query: buildTempTableQuery(
        buildCreateTableQuery,
        tableName,
        tempTableName,
        replicatedEngine,
      ),
      clickhouse_settings: { wait_end_of_query: 1 },
    },
    client ? { clickhouseClient: client } : undefined,
  );

  logger().info({ tableName, host }, "Copying data into replicated table");
  await command(
    {
      query: `INSERT INTO ${tempTableName} SELECT * FROM ${tableName}`,
      clickhouse_settings: { max_execution_time: 0 },
    },
    client ? { clickhouseClient: client } : undefined,
  );

  await command(
    {
      query: `DROP TABLE ${tableName}`,
      clickhouse_settings: { wait_end_of_query: 1 },
    },
    client ? { clickhouseClient: client } : undefined,
  );

  await command(
    {
      query: `RENAME TABLE ${tempTableName} TO ${tableName}`,
      clickhouse_settings: { wait_end_of_query: 1 },
    },
    client ? { clickhouseClient: client } : undefined,
  );

  await createMaterializedView(buildCreateMaterializedViewQuery, host);
}

async function attachSecondaryReplica({
  tableName,
  buildCreateTableQuery,
  materializedViewName,
  buildCreateMaterializedViewQuery,
  host,
}: MigrateMergeTreeToReplicatedParams & { host: string }) {
  const client = createClickhouseClient({ host });
  const replicatedEngine = getReplicatedMergeTreeEngine(tableName);

  await dropMaterializedView(materializedViewName, host);

  await command(
    {
      query: `DROP TABLE IF EXISTS ${tableName}`,
      clickhouse_settings: { wait_end_of_query: 1 },
    },
    { clickhouseClient: client },
  );

  await command(
    {
      query: buildCreateTableQuery(replicatedEngine).replace(
        "IF NOT EXISTS ",
        "",
      ),
      clickhouse_settings: { wait_end_of_query: 1 },
    },
    { clickhouseClient: client },
  );

  logger().info({ tableName, host }, "Syncing replicated table");
  await command(
    {
      query: `SYSTEM SYNC REPLICA ${tableName}`,
      clickhouse_settings: { wait_end_of_query: 1 },
    },
    { clickhouseClient: client },
  );

  await createMaterializedView(buildCreateMaterializedViewQuery, host);
}

export async function migrateMergeTreeToReplicatedMergeTree(
  params: MigrateMergeTreeToReplicatedParams,
) {
  const { tableName } = params;
  const engine = await getTableEngine(tableName);
  if (!engine) {
    logger().info({ tableName }, "Table does not exist, skipping migration");
    return;
  }
  if (isReplicatedTableEngine(engine)) {
    logger().info(
      { tableName, engine },
      "Table already uses replicated engine, skipping migration",
    );
    return;
  }

  const hosts = await getClickhouseClusterHttpHosts();
  if (hosts.length <= 1) {
    await migratePrimaryReplica(params);
    logger().info({ tableName }, "Migration to ReplicatedMergeTree completed");
    return;
  }

  const hostCounts = await Promise.all(
    hosts.map(async (host) => ({
      host,
      count: await getTableRowCount(tableName, host),
    })),
  );
  const primaryHost = hostCounts.reduce((max, current) =>
    current.count > max.count ? current : max,
  ).host;
  const secondaryHosts = hosts.filter((host) => host !== primaryHost);

  logger().info(
    { tableName, primaryHost, secondaryHosts, hostCounts },
    "Migrating table to ReplicatedMergeTree across replicas",
  );

  await migratePrimaryReplica({ ...params, host: primaryHost });

  for (const host of secondaryHosts) {
    await attachSecondaryReplica({ ...params, host });
  }

  logger().info({ tableName }, "Migration to ReplicatedMergeTree completed");
}
