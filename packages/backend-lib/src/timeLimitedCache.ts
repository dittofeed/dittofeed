import { SetTimeLimitedCacheRequest } from "isomorphic-lib/src/types";

import { db } from "./db";
import * as schema from "./db/schema";

export function setTimeLimitedCache({
  workspaceId,
  key,
  value,
  expiresAt,
}: SetTimeLimitedCacheRequest) {
  return db().insert(schema.timeLimitedCache).values({
    workspaceId,
    key,
    value,
    expiresAt,
  });
}
