// eslint-disable-next-line filenames/no-index
import { QueryPromise } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { err, ok, Result } from "neverthrow";

import config from "../config";

export type QueryError = Error & { code: string };

export async function queryResult<D, P extends QueryPromise<D>>(
  promise: P,
): Promise<Result<D, QueryError>> {
  try {
    const result = await promise;
    return ok(result);
  } catch (e) {
    if (e instanceof Error && "code" in e && typeof e.code === "string") {
      return err(e);
    }
    throw e;
  }
}

const db = drizzle(config().databaseUrl);

export default db;
