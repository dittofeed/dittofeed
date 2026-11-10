import {
  claimCatalog,
  DueCatalog,
  findDueCatalogs,
  syncCatalogFromFeed,
} from "./catalogSync";
import config from "./config";
import logger from "./logger";

/**
 * Temporal activities for the catalog sync scheduler.
 *
 * Everything with a side effect lives here rather than in the workflow body, so
 * the workflow stays a loop of retryable steps and the logic stays unit
 * testable without a Temporal test server.
 */

// Wrapped in a promise so the workflow can await a deterministic snapshot of
// the config instead of reading env inside Temporal's sandbox.
// eslint-disable-next-line @typescript-eslint/require-await
export async function catalogSyncConfig(): Promise<{
  catalogSyncSchedulerInterval: number;
  catalogSyncSchedulerIterations: number;
  catalogSyncBatchSize: number;
}> {
  const resolved = config();
  return {
    catalogSyncSchedulerInterval: resolved.catalogSyncSchedulerInterval,
    catalogSyncSchedulerIterations: resolved.catalogSyncSchedulerIterations,
    catalogSyncBatchSize: resolved.catalogSyncBatchSize,
  };
}

export async function catalogFindDue({
  now,
  limit,
}: {
  now: number;
  limit: number;
}): Promise<DueCatalog[]> {
  return findDueCatalogs({ now: new Date(now), limit });
}

export interface CatalogSyncActivityResult {
  catalogId: string;
  catalogName: string;
  claimed: boolean;
  status?: "ok" | "partial" | "failed";
  upsertedCount: number;
  archivedCount: number;
  skippedCount: number;
  error?: string;
}

/**
 * Claims a catalog and pulls its feed. Claiming is what makes the scheduler safe
 * to run in more than one worker: the loser of the race returns immediately.
 */
export async function catalogSyncOne({
  catalogId,
  now,
}: {
  catalogId: string;
  now: number;
}): Promise<CatalogSyncActivityResult | null> {
  const at = new Date(now);
  const claimed = await claimCatalog({ catalogId, now: at });
  if (!claimed) {
    return null;
  }
  const result = await syncCatalogFromFeed({ catalog: claimed, now: at });
  if (result.isErr()) {
    return {
      catalogId: claimed.id,
      catalogName: claimed.name,
      claimed: true,
      status: "failed",
      upsertedCount: 0,
      archivedCount: 0,
      skippedCount: 0,
      error: result.error.message,
    };
  }
  const outcome = result.value;
  logger().info(
    {
      catalogId: claimed.id,
      catalogName: claimed.name,
      status: outcome.status,
      upsertedCount: outcome.upsertedCount,
      archivedCount: outcome.archivedCount,
      skippedCount: outcome.skippedCount,
    },
    "Catalog feed synced",
  );
  return {
    catalogId: claimed.id,
    catalogName: claimed.name,
    claimed: true,
    status: outcome.status,
    upsertedCount: outcome.upsertedCount,
    archivedCount: outcome.archivedCount,
    skippedCount: outcome.skippedCount,
  };
}
