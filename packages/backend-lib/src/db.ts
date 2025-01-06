// eslint-disable-next-line filenames/no-index
import { Table } from "drizzle-orm";
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
    throw e;
  }
}

export type Schema = typeof schema & typeof relations;

export type Db = NodePgDatabase<Schema>;

let DB: Db | null = null;
let POOL: Pool | null = null;

export function pool(): Pool {
  if (!POOL) {
    console.log("loc1", config().databaseUrl);
    POOL = new Pool({
      connectionString: config().databaseUrl,
    });
  }
  return POOL;
}

export function db(): Db {
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
  ...onConflict
}: {
  table: TTable;
  values: TTable["$inferInsert"];
} & PgInsertOnConflictDoUpdateConfig<TInsert>): Promise<
  Result<TTable["$inferSelect"], QueryError>
> {
  const results = await queryResult(
    db()
      .insert(table)
      .values(values)
      .onConflictDoUpdate(onConflict)
      .returning(),
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

export async function insert<TTable extends Table>({
  table,
  values,
  tx = db(),
  doNothingOnConflict = false,
}: {
  table: TTable;
  values: TTable["$inferInsert"];
  doNothingOnConflict?: boolean;
  tx?: Db;
}): Promise<Result<TTable["$inferSelect"], QueryError>> {
  const query = tx.insert(table).values(values).returning();
  const results = await queryResult(
    doNothingOnConflict ? query.onConflictDoNothing() : query,
  );
  if (results.isErr()) {
    return results;
  }
  const result = results.value[0];
  if (!result) {
    throw new Error("No result returned from insert");
  }
  return ok(result);
}
