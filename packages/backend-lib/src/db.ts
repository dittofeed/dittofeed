// eslint-disable-next-line filenames/no-index
import { Table } from "drizzle-orm";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  PgInsertBase,
  PgInsertOnConflictDoUpdateConfig,
  PgQueryResultHKT,
} from "drizzle-orm/pg-core";
import { err, ok, Result } from "neverthrow";
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

export type Db = NodePgDatabase<typeof schema & typeof relations>;

let DB: Db | null = null;

export function db(): Db {
  if (!DB) {
    const d = drizzle(config().databaseUrl, {
      schema: {
        ...schema,
        ...relations,
      },
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
}: {
  table: TTable;
  values: TTable["$inferInsert"];
}): Promise<Result<TTable["$inferSelect"], QueryError>> {
  const results = await queryResult(
    db().insert(table).values(values).returning(),
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
