import { eq } from "drizzle-orm";
import { Result } from "neverthrow";

import { insert, QueryError, upsert } from "../db";
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

export async function upsertWorkspace(
  values: typeof dbWorkspace.$inferInsert,
): Promise<Result<typeof dbWorkspace.$inferSelect, QueryError>> {
  if (
    values.domain === undefined &&
    values.externalId === undefined &&
    values.type === undefined &&
    values.status === undefined &&
    values.parentWorkspaceId === undefined
  ) {
    return insert({
      table: dbWorkspace,
      values,
      doNothingOnConflict: true,
      lookupExisting: eq(dbWorkspace.name, values.name),
    });
  }
  return upsert({
    table: dbWorkspace,
    values,
    target: [dbWorkspace.parentWorkspaceId, dbWorkspace.name],
    set: {
      domain: values.domain,
      type: values.type,
      externalId: values.externalId,
      status: values.status,
      parentWorkspaceId: values.parentWorkspaceId,
    },
  });
}
