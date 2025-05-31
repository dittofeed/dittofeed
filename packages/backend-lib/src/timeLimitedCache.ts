import { and, eq } from "drizzle-orm";
import {
  GetTimeLimitedCacheRequest,
  GetTimeLimitedCacheResponse,
  SetTimeLimitedCacheRequest,
} from "isomorphic-lib/src/types";

import { db } from "./db";
import * as schema from "./db/schema";

export function setTimeLimitedCache({
  workspaceId,
  key,
  value,
  expiresAt,
}: SetTimeLimitedCacheRequest) {
  return db()
    .insert(schema.timeLimitedCache)
    .values({
      workspaceId,
      key,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      value,
      expiresAt: new Date(expiresAt), // Ensure expiresAt is a Date object
    })
    .onConflictDoUpdate({
      target: [
        schema.timeLimitedCache.workspaceId,
        schema.timeLimitedCache.key,
      ],
      set: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        value,
        expiresAt: new Date(expiresAt), // Ensure expiresAt is a Date object for update
        updatedAt: new Date(), // Explicitly set updatedAt on update
      },
    });
}

export async function getTimeLimitedCache({
  workspaceId,
  key,
}: GetTimeLimitedCacheRequest): Promise<GetTimeLimitedCacheResponse> {
  const result = await db().query.timeLimitedCache.findFirst({
    where: and(
      eq(schema.timeLimitedCache.workspaceId, workspaceId),
      eq(schema.timeLimitedCache.key, key),
    ),
  });
  if (!result) {
    return null;
  }
  return {
    value: result.value,
    expiresAt: result.expiresAt.toISOString(),
  };
}
