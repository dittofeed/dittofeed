import { eq } from "drizzle-orm";
import { Result } from "neverthrow";

import { insert, QueryError } from "../db";
import { workspace as dbWorkspace } from "../db/schema";

export async function createWorkspace(
  values: typeof dbWorkspace.$inferInsert,
): Promise<Result<typeof dbWorkspace.$inferSelect, QueryError>> {
  return insert({
    table: dbWorkspace,
    values,
    doNothingOnConflict: true,
    lookupExisting: eq(dbWorkspace.name, values.name),
  });
}
