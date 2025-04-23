// eslint-disable-next-line filenames/no-index
import { SQL, Table } from "drizzle-orm";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  PgInsertBase,
  PgInsertOnConflictDoUpdateConfig,
  PgQueryResultHKT,
} from "drizzle-orm/pg-core";
import { err, ok, Result } from "neverthrow";
import { Pool } from "pg";
import { PostgresError } from "pg-error-enum";

import config from "./config";
import * as relations from "./db/relations";
import * as schema from "./db/schema";
import logger from "./logger";

// declaring as global because singletons are wacky in jest

declare global {
  // eslint-disable-next-line vars-on-top, no-var
  var POOL: Pool | null;
  // eslint-disable-next-line vars-on-top, no-var
  var DB: Db | null;
  // eslint-disable-next-line vars-on-top, no-var
  var POOL_ENDED: boolean;
}

// Initialize if not already set
if (typeof globalThis.POOL === "undefined") globalThis.POOL = null;
if (typeof globalThis.DB === "undefined") globalThis.DB = null;
if (typeof globalThis.POOL_ENDED === "undefined") globalThis.POOL_ENDED = false;

export { PostgresError };

export type TxQueryError = { code: PostgresError };

export function isTxQueryError(e: unknown): e is TxQueryError {
  return typeof e === "object" && e !== null && "code" in e;
}

export async function txQueryResult<D, P extends Promise<D>>(
  promise: P,
): Promise<Result<Awaited<P>, TxQueryError>> {
  try {
    const result = await promise;
    return ok(result);
  } catch (e) {
    if (isTxQueryError(e)) {
      return err(e);
    }
    logger().debug({ err: e }, "Unexpected error in txQueryResult");
    throw e;
  }
}

export type QueryError = Error & { code: PostgresError };

export function isQueryError(e: unknown): e is QueryError {
  return e instanceof Error && "code" in e && typeof e.code === "string";
}

export async function queryResult<D, P extends Promise<D>>(
  promise: P,
): Promise<Result<Awaited<P>, QueryError>> {
  try {
    const result = await promise;
    return ok(result);
  } catch (e) {
    if (isQueryError(e)) {
      return err(e);
    }
    logger().debug({ err: e }, "Unexpected error in queryResult");
    throw e;
  }
}

export type Schema = typeof schema & typeof relations;

export type Db = NodePgDatabase<Schema>;

export function pool(): Pool {
  if (POOL_ENDED) {
    throw new Error("Pool already ended");
  }
  if (!POOL) {
    POOL = new Pool({
      connectionString: config().databaseUrl,
    });
  }

  return POOL;
}

export async function endPool() {
  if (POOL_ENDED) {
    return;
  }
  POOL_ENDED = true;
  await POOL?.end();
  POOL = null;
}

export function db(): Db {
  if (POOL_ENDED) {
    throw new Error("Database already ended");
  }
  if (!DB) {
    const dbSchema = {
      ...schema,
      ...relations,
    };
    const d = drizzle({
      client: pool(),
      schema: dbSchema,
    });
    DB = d;
    return d;
  }
  return DB;
}

export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

export async function upsert<
  TTable extends Table,
  TInsert extends PgInsertBase<TTable, PgQueryResultHKT>,
>({
  table,
  values,
  tx: txArg,
  ...onConflict
}: {
  table: TTable;
  values: TTable["$inferInsert"];
  tx?: Db;
} & PgInsertOnConflictDoUpdateConfig<TInsert>): Promise<
  Result<TTable["$inferSelect"], QueryError>
> {
  const tx = txArg ?? db();
  const results = await queryResult(
    tx.insert(table).values(values).onConflictDoUpdate(onConflict).returning(),
  );
  if (results.isErr()) {
    return results;
  }
  const result = results.value[0];
  if (!result) {
    throw new Error("No result returned from upsert");
  }
  return ok(result);
}

// Overload for when doNothingOnConflict is true
export async function insert<TTable extends Table>(params: {
  table: TTable;
  values: TTable["$inferInsert"];
  doNothingOnConflict: true;
  lookupExisting?: undefined;
  tx?: Db;
}): Promise<Result<TTable["$inferSelect"] | null, QueryError>>;

// Overload for when doNothingOnConflict is false or not provided
export async function insert<TTable extends Table>(
  params:
    | {
        table: TTable;
        values: TTable["$inferInsert"];
        doNothingOnConflict?: false;
        lookupExisting?: undefined;
        tx?: Db;
      }
    | {
        table: TTable;
        values: TTable["$inferInsert"];
        doNothingOnConflict: true;
        lookupExisting: SQL;
        tx?: Db;
      },
): Promise<Result<TTable["$inferSelect"], QueryError>>;

export async function insert<TTable extends Table>({
  table,
  values,
  tx: txArg,
  doNothingOnConflict = false,
  lookupExisting,
}: {
  table: TTable;
  values: TTable["$inferInsert"];
  lookupExisting?: SQL;
  doNothingOnConflict?: boolean;
  tx?: Db;
}): Promise<Result<TTable["$inferSelect"] | null, QueryError>> {
  const tx = txArg ?? db();
  const query = tx.insert(table).values(values).returning();
  const results = await queryResult(
    doNothingOnConflict ? query.onConflictDoNothing() : query,
  );
  if (results.isErr()) {
    return results;
  }
  const result = results.value[0];
  if (result) {
    return ok(result);
  }

  if (!doNothingOnConflict) {
    throw new Error("No result returned from insert");
  }
  if (!lookupExisting) {
    return ok(null);
  }

  const [existing] = await tx
    .select()
    .from(table)
    .where(lookupExisting)
    .limit(1);
  if (existing) {
    return ok(existing);
  }

  logger().error({ table, values, lookupExisting }, "No existing record found");
  throw new Error("No existing record found");
}
