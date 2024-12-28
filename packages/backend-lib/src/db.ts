// eslint-disable-next-line filenames/no-index
import { QueryPromise } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { err, ok, Result } from "neverthrow";
import { PostgresError } from "pg-error-enum";

import config from "./config";

export type QueryError = Error & { code: PostgresError };

function isQueryError(e: unknown): e is QueryError {
  return e instanceof Error && "code" in e && typeof e.code === "string";
}

export async function queryResult<D, P extends QueryPromise<D>>(
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

let DB: ReturnType<typeof drizzle> | null = null;

export function db(): ReturnType<typeof drizzle> {
  if (!DB) {
    const d = drizzle(config().databaseUrl);
    DB = d;
    return d;
  }
  return DB;
}
