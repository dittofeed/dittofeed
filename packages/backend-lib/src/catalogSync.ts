import { and, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { CatalogFeedFormat, CatalogSyncKind } from "isomorphic-lib/src/catalog";
import { err, ok, Result } from "neverthrow";

import {
  announceCatalogItemChanges,
  CatalogItemChange,
} from "./catalogAnnouncements";
import { FeedParseResult, fetchCatalogFeed } from "./catalogFeed";
import { completeCatalogSync, upsertCatalogItems } from "./catalogs";
import { db } from "./db";
import {
  catalog as dbCatalog,
  catalogItem as dbCatalogItem,
  catalogSyncRun as dbCatalogSyncRun,
} from "./db/schema";
import logger from "./logger";

/**
 * Pulling catalogs from feeds.
 *
 * These are plain functions, not Temporal workflows: the scheduler workflow is
 * a thin loop around them. Keeping the logic out of the workflow means it can be
 * unit tested, and means the manual "sync now" endpoint and the scheduler share
 * exactly one implementation.
 *
 * Two invariants matter:
 *
 * 1. A failed pull must not empty a catalog. Failure is recorded, the catalog is
 *    marked stale, and the previously synced rows keep rendering.
 * 2. Two workers must not pull the same catalog at the same time. `claimCatalog`
 *    advances `nextSyncAt` conditionally, so only one caller wins the row.
 */

/**
 * Ceiling for retry backoff. Above the default six hour interval so backoff
 * actually separates the retries, but still low enough that a catalog recovering
 * from a bad deploy refreshes the same day.
 */
export const MAX_RETRY_MINUTES = 24 * 60;

/** How many catalogs one scheduler tick will pull. */
export const DEFAULT_SYNC_BATCH_SIZE = 25;

export interface DueCatalog {
  id: string;
  workspaceId: string;
  name: string;
  sourceUrl: string;
  feedFormat?: CatalogFeedFormat;
  syncIntervalMinutes: number;
  consecutiveFailures: number;
}

export interface CatalogSyncOutcome {
  status: "ok" | "partial" | "failed";
  upsertedCount: number;
  archivedCount: number;
  skippedCount: number;
  error?: string;
  syncRunId: string;
}

/** Price moves smaller than this are rounding noise between two feeds, not a
 * price change worth an event. */
const PRICE_EPSILON = 0.005;

export interface ItemSnapshot {
  itemId: string;
  title: string | null;
  parentItemId: string | null;
  url: string | null;
  imageUrl: string | null;
  currency: string | null;
  price: number | null;
  inventoryQuantity: number | null;
  inStock: boolean;
}

async function snapshotCatalogItems({
  catalogId,
  itemIds,
}: {
  catalogId: string;
  itemIds: string[];
}): Promise<Map<string, ItemSnapshot>> {
  if (itemIds.length === 0) {
    return new Map();
  }
  const rows = await db()
    .select({
      itemId: dbCatalogItem.itemId,
      title: dbCatalogItem.title,
      parentItemId: dbCatalogItem.parentItemId,
      url: dbCatalogItem.url,
      imageUrl: dbCatalogItem.imageUrl,
      currency: dbCatalogItem.currency,
      price: dbCatalogItem.price,
      inventoryQuantity: dbCatalogItem.inventoryQuantity,
      inStock: dbCatalogItem.inStock,
    })
    .from(dbCatalogItem)
    .where(
      and(
        eq(dbCatalogItem.catalogId, catalogId),
        inArray(dbCatalogItem.itemId, itemIds),
      ),
    );
  return new Map(rows.map((row) => [row.itemId, row]));
}

function changesFor({
  before,
  after,
}: {
  before: ItemSnapshot;
  after: ItemSnapshot;
}): CatalogItemChange[] {
  const base = {
    itemId: after.itemId,
    title: after.title ?? undefined,
    parentItemId: after.parentItemId ?? undefined,
    url: after.url ?? undefined,
    imageUrl: after.imageUrl ?? undefined,
    currency: after.currency ?? undefined,
    price: after.price ?? undefined,
    inventoryQuantity: after.inventoryQuantity ?? undefined,
  };

  const changes: CatalogItemChange[] = [];

  if (
    before.price !== null &&
    after.price !== null &&
    after.price < before.price - PRICE_EPSILON
  ) {
    changes.push({ ...base, type: "priceDrop", previousPrice: before.price });
  }

  // Two ways an item comes back: it was unbuyable and now is, or it went from
  // zero units to some units while backorders kept it on sale.
  //
  // Reported independently of the price drop above: a restock at a lower price
  // is both pieces of news, and the two audiences are different (waitlist versus
  // browsers), so collapsing them would silently drop one of them.
  const wasSoldOut = !before.inStock;
  const wentFromZeroToPositive =
    before.inventoryQuantity !== null &&
    before.inventoryQuantity <= 0 &&
    after.inventoryQuantity !== null &&
    after.inventoryQuantity > 0;
  if ((wasSoldOut && after.inStock) || wentFromZeroToPositive) {
    changes.push({ ...base, type: "backInStock" });
  }

  return changes;
}

/**
 * Compares the catalog before and after a sync.
 *
 * Prices and stock are the only things a feed can change silently, and they are
 * exactly the things a profile cares about. The comparison is done on rows
 * rather than on feed payloads because the upsert merges partial records: an
 * item whose feed entry only carries a price still has its other columns, and
 * only the stored row tells the truth about what changed.
 */
export function detectCatalogItemChanges({
  before,
  after,
}: {
  before: Map<string, ItemSnapshot>;
  after: Map<string, ItemSnapshot>;
}): CatalogItemChange[] {
  const changes: CatalogItemChange[] = [];
  for (const [itemId, afterItem] of after) {
    const beforeItem = before.get(itemId);
    if (!beforeItem) {
      continue;
    }
    changes.push(...changesFor({ before: beforeItem, after: afterItem }));
  }
  return changes;
}

function feedFormatFrom(value: string | null): CatalogFeedFormat | undefined {
  if (value === CatalogFeedFormat.Json) {
    return CatalogFeedFormat.Json;
  }
  if (value === CatalogFeedFormat.Xml) {
    return CatalogFeedFormat.Xml;
  }
  return undefined;
}

/**
 * Exponential backoff, capped so a catalog that has been failing for a day is
 * still retried rather than silently abandoned.
 */
export function retryDelayMinutes({
  syncIntervalMinutes,
  consecutiveFailures,
}: {
  syncIntervalMinutes: number;
  consecutiveFailures: number;
}): number {
  const exponent = Math.min(Math.max(consecutiveFailures, 0), 4);
  return Math.min(syncIntervalMinutes * 2 ** exponent, MAX_RETRY_MINUTES);
}

/** `nextSyncAt is null` expressed as a condition so the index still applies. */
function nextSyncAtIsNull() {
  return sql`${dbCatalog.nextSyncAt} is null`;
}

/**
 * Catalogs that are due for a pull. `nextSyncAt` is null for feed catalogs that
 * were created before the scheduler existed, so those are treated as due.
 */
export async function findDueCatalogs({
  now = new Date(),
  limit = DEFAULT_SYNC_BATCH_SIZE,
}: {
  now?: Date;
  limit?: number;
} = {}): Promise<DueCatalog[]> {
  const rows = await db()
    .select({
      id: dbCatalog.id,
      workspaceId: dbCatalog.workspaceId,
      name: dbCatalog.name,
      sourceUrl: dbCatalog.sourceUrl,
      feedFormat: dbCatalog.feedFormat,
      syncIntervalMinutes: dbCatalog.syncIntervalMinutes,
      consecutiveFailures: dbCatalog.consecutiveFailures,
    })
    .from(dbCatalog)
    .where(
      and(
        eq(dbCatalog.syncEnabled, true),
        isNotNull(dbCatalog.sourceUrl),
        or(nextSyncAtIsNull(), lte(dbCatalog.nextSyncAt, now)),
      ),
    )
    .orderBy(sql`${dbCatalog.nextSyncAt} asc nulls first`)
    .limit(limit);

  return rows.flatMap((row) => {
    const { sourceUrl } = row;
    if (!sourceUrl) {
      return [];
    }
    return [
      {
        id: row.id,
        workspaceId: row.workspaceId,
        name: row.name,
        sourceUrl,
        feedFormat: feedFormatFrom(row.feedFormat),
        syncIntervalMinutes: row.syncIntervalMinutes,
        consecutiveFailures: row.consecutiveFailures,
      },
    ];
  });
}

/**
 * Atomically takes ownership of a due catalog by pushing `nextSyncAt` forward.
 * Returns null when another worker already claimed it, which is the normal case
 * when several scheduler instances poll the same table.
 */
export async function claimCatalog({
  catalogId,
  now = new Date(),
}: {
  catalogId: string;
  now?: Date;
}): Promise<DueCatalog | null> {
  const rows = await db()
    .select({
      id: dbCatalog.id,
      workspaceId: dbCatalog.workspaceId,
      name: dbCatalog.name,
      sourceUrl: dbCatalog.sourceUrl,
      feedFormat: dbCatalog.feedFormat,
      syncIntervalMinutes: dbCatalog.syncIntervalMinutes,
      consecutiveFailures: dbCatalog.consecutiveFailures,
    })
    .from(dbCatalog)
    .where(
      and(
        eq(dbCatalog.id, catalogId),
        eq(dbCatalog.syncEnabled, true),
        isNotNull(dbCatalog.sourceUrl),
      ),
    )
    .limit(1);
  const current = rows[0];
  if (!current?.sourceUrl) {
    return null;
  }

  const nextSyncAt = new Date(
    now.getTime() + current.syncIntervalMinutes * 60 * 1000,
  );
  const claimed = await db()
    .update(dbCatalog)
    .set({ nextSyncAt, updatedAt: now })
    .where(
      and(
        eq(dbCatalog.id, catalogId),
        or(nextSyncAtIsNull(), lte(dbCatalog.nextSyncAt, now)),
      ),
    )
    .returning({ id: dbCatalog.id });
  if (!claimed.length) {
    return null;
  }
  return {
    id: current.id,
    workspaceId: current.workspaceId,
    name: current.name,
    sourceUrl: current.sourceUrl,
    feedFormat: feedFormatFrom(current.feedFormat),
    syncIntervalMinutes: current.syncIntervalMinutes,
    consecutiveFailures: current.consecutiveFailures,
  };
}

async function recordFailedRun({
  workspaceId,
  catalogId,
  syncId,
  error,
}: {
  workspaceId: string;
  catalogId: string;
  syncId: string;
  error: string;
}): Promise<string> {
  const rows = await db()
    .insert(dbCatalogSyncRun)
    .values({
      workspaceId,
      catalogId,
      kind: CatalogSyncKind.Items,
      syncId,
      status: "failed",
      upsertedCount: 0,
      deletedCount: 0,
      skippedCount: 0,
      error: error.slice(0, 4000),
      finishedAt: new Date(),
    })
    .returning({ id: dbCatalogSyncRun.id });
  return rows[0]?.id ?? "";
}

/**
 * Records a failed pull: the catalog is flagged stale and retried with backoff,
 * but its rows are left untouched so templates keep rendering.
 */
async function markSyncFailed({
  workspaceId,
  catalogId,
  syncId,
  error,
  now,
}: {
  workspaceId: string;
  catalogId: string;
  syncId: string;
  error: string;
  now: Date;
}): Promise<string> {
  const rows = await db()
    .select({
      syncIntervalMinutes: dbCatalog.syncIntervalMinutes,
      consecutiveFailures: dbCatalog.consecutiveFailures,
    })
    .from(dbCatalog)
    .where(eq(dbCatalog.id, catalogId));
  const current = rows[0];
  const failures = (current?.consecutiveFailures ?? 0) + 1;
  const delayMinutes = retryDelayMinutes({
    syncIntervalMinutes: current?.syncIntervalMinutes ?? 360,
    consecutiveFailures: failures - 1,
  });
  await db()
    .update(dbCatalog)
    .set({
      syncStatus: "failed",
      consecutiveFailures: failures,
      nextSyncAt: new Date(now.getTime() + delayMinutes * 60 * 1000),
      updatedAt: now,
    })
    .where(eq(dbCatalog.id, catalogId));
  const syncRunId = await recordFailedRun({
    workspaceId,
    catalogId,
    syncId,
    error,
  });
  logger().error(
    { catalogId, syncRunId, failures, delayMinutes, err: error },
    "Catalog feed sync failed",
  );
  return syncRunId;
}

/**
 * Pulls one catalog's feed and applies it.
 *
 * The item write and the archive step share a `syncId`, so items dropped by the
 * feed are archived rather than deleted, and a render that happens mid sync sees
 * old and new items together instead of a hole.
 */
export async function syncCatalogFromFeed({
  catalog,
  now = new Date(),
}: {
  catalog: DueCatalog;
  now?: Date;
}): Promise<
  Result<CatalogSyncOutcome, { message: string; syncRunId: string }>
> {
  const syncId = `feed_${now.getTime()}_${catalog.id}`;

  let parsed: FeedParseResult;
  try {
    parsed = await fetchCatalogFeed({
      url: catalog.sourceUrl,
      format: catalog.feedFormat,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const syncRunId = await markSyncFailed({
      workspaceId: catalog.workspaceId,
      catalogId: catalog.id,
      syncId,
      error: message,
      now,
    });
    return err({ message, syncRunId });
  }

  if (!parsed.items.length) {
    const message =
      "Feed contained no usable items; leaving the catalog as is.";
    const syncRunId = await markSyncFailed({
      workspaceId: catalog.workspaceId,
      catalogId: catalog.id,
      syncId,
      error: message,
      now,
    });
    return err({ message, syncRunId });
  }

  const feedItemIds = [
    ...new Set(
      parsed.items
        .map((item) => item.itemId)
        .filter((itemId): itemId is string => Boolean(itemId)),
    ),
  ];
  // Snapshot before the write: the upsert overwrites the old price and stock, so
  // afterwards there is nothing left to compare against.
  const before = await snapshotCatalogItems({
    catalogId: catalog.id,
    itemIds: feedItemIds,
  });

  const written = await upsertCatalogItems({
    workspaceId: catalog.workspaceId,
    catalogName: catalog.name,
    items: parsed.items,
    kind: CatalogSyncKind.Items,
    syncId,
  });
  if (written.isErr()) {
    const syncRunId = await markSyncFailed({
      workspaceId: catalog.workspaceId,
      catalogId: catalog.id,
      syncId,
      error: written.error.message,
      now,
    });
    return err({ message: written.error.message, syncRunId });
  }

  const completed = await completeCatalogSync({
    workspaceId: catalog.workspaceId,
    catalogName: catalog.name,
    syncId,
  });
  if (completed.isErr()) {
    const syncRunId = await markSyncFailed({
      workspaceId: catalog.workspaceId,
      catalogId: catalog.id,
      syncId,
      error: completed.error.message,
      now,
    });
    return err({ message: completed.error.message, syncRunId });
  }

  const status: "ok" | "partial" =
    parsed.skipped.length || written.value.skippedCount ? "partial" : "ok";
  await db()
    .update(dbCatalog)
    .set({
      syncStatus: status,
      consecutiveFailures: 0,
      feedFormat: catalog.feedFormat ?? parsed.format,
      updatedAt: now,
    })
    .where(eq(dbCatalog.id, catalog.id));

  const syncRuns = await db()
    .select({ id: dbCatalogSyncRun.id })
    .from(dbCatalogSyncRun)
    .where(
      and(
        eq(dbCatalogSyncRun.catalogId, catalog.id),
        eq(dbCatalogSyncRun.syncId, syncId),
      ),
    )
    .limit(1);

  const after = await snapshotCatalogItems({
    catalogId: catalog.id,
    itemIds: feedItemIds,
  });
  const changes = detectCatalogItemChanges({ before, after });
  if (changes.length > 0) {
    const announced = await announceCatalogItemChanges({
      workspaceId: catalog.workspaceId,
      catalogId: catalog.id,
      changes,
      now,
    });
    logger().info(
      {
        catalogId: catalog.id,
        priceDrops: changes.filter((change) => change.type === "priceDrop")
          .length,
        restocks: changes.filter((change) => change.type === "backInStock")
          .length,
        ...announced,
      },
      "Announced catalog item changes",
    );
  }

  if (parsed.skipped.length) {
    logger().warn(
      { catalogId: catalog.id, skipped: parsed.skipped.slice(0, 20) },
      "Catalog feed carried records that were skipped",
    );
  }

  return ok({
    status,
    upsertedCount: written.value.upsertedCount,
    archivedCount: completed.value.archivedCount,
    skippedCount: parsed.skipped.length + written.value.skippedCount,
    syncRunId: syncRuns[0]?.id ?? "",
  });
}

/**
 * Manual "sync this catalog now", used by the admin endpoint and by tests.
 * Unlike the scheduler this does not respect `nextSyncAt`, but it does respect
 * `syncEnabled` so a paused catalog is not pulled by accident.
 */
export async function syncCatalog({
  workspaceId,
  catalogName,
  now = new Date(),
}: {
  workspaceId: string;
  catalogName: string;
  now?: Date;
}): Promise<
  Result<
    CatalogSyncOutcome & { syncRunId: string },
    { message: string; code?: string }
  >
> {
  const rows = await db()
    .select({
      id: dbCatalog.id,
      workspaceId: dbCatalog.workspaceId,
      name: dbCatalog.name,
      sourceUrl: dbCatalog.sourceUrl,
      feedFormat: dbCatalog.feedFormat,
      syncIntervalMinutes: dbCatalog.syncIntervalMinutes,
      consecutiveFailures: dbCatalog.consecutiveFailures,
    })
    .from(dbCatalog)
    .where(
      and(
        eq(dbCatalog.workspaceId, workspaceId),
        eq(dbCatalog.name, catalogName),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    return err({
      code: "notFound",
      message: `Catalog ${catalogName} not found`,
    });
  }
  if (!row.sourceUrl) {
    return err({
      code: "invalid",
      message: `Catalog ${catalogName} has no sourceUrl to pull from`,
    });
  }

  const result = await syncCatalogFromFeed({
    catalog: {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      sourceUrl: row.sourceUrl,
      feedFormat: feedFormatFrom(row.feedFormat),
      syncIntervalMinutes: row.syncIntervalMinutes,
      consecutiveFailures: row.consecutiveFailures,
    },
    now,
  });

  // A manual pull also counts as "just synced", so the scheduler does not pull
  // again seconds later.
  if (result.isOk()) {
    await db()
      .update(dbCatalog)
      .set({
        nextSyncAt: new Date(
          now.getTime() + row.syncIntervalMinutes * 60 * 1000,
        ),
      })
      .where(eq(dbCatalog.id, row.id));
    return ok(result.value);
  }
  return err({
    code: "syncFailed",
    message: result.error.message,
  });
}
