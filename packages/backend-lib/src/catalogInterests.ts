import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  CatalogInterestKind,
  CatalogItemInterestResource,
} from "isomorphic-lib/src/catalog";
import { err, ok, Result } from "neverthrow";

import type { CatalogError } from "./catalogs";
import { db } from "./db";
import {
  catalog as dbCatalog,
  catalogItem as dbCatalogItem,
  catalogItemInterest as dbCatalogItemInterest,
} from "./db/schema";

/**
 * Catalog items are useless on their own: a price drop only matters to the
 * people who were looking at that item. This module keeps that link.
 *
 * The link is deliberately stored in Postgres instead of being read out of
 * `user_events_v2`. Event properties are an unindexed JSON blob, so answering
 * "who viewed item X" from the event store would mean scanning the workspace's
 * whole event history on every sync. One row per (user, item, kind) is cheap to
 * write, cheap to fan out from, and can be inspected by an operator.
 *
 * Recording is best effort: a tracking call must never fail because a catalog
 * lookup did. Callers treat a rejected promise here as a logged warning.
 */

/** Fields an inbound item reference may use. Klaviyo uses `$item_id`, many
 * integrations send `sku` or the raw product id. */
const ITEM_ID_KEYS = [
  "itemId",
  "item_id",
  "$item_id",
  "productId",
  "product_id",
  "$product_id",
  "sku",
  "$sku",
];

const QUANTITY_KEYS = ["quantity", "$quantity", "qty"];
const PRICE_KEYS = ["price", "$price", "value"];

/** Cap on item references read from one event, so a malformed payload cannot
 * turn into an unbounded insert. */
const MAX_ITEMS_PER_EVENT = 100;

export interface CatalogItemRef {
  itemId: string;
  quantity: number;
  price?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFrom(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, "."));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function firstOf(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = stringFrom(record[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function refFrom(record: Record<string, unknown>): CatalogItemRef | undefined {
  const itemId = firstOf(record, ITEM_ID_KEYS);
  if (!itemId) {
    return undefined;
  }
  const quantity = numberFrom(
    QUANTITY_KEYS.map((key) => record[key]).find((v) => v !== undefined),
  );
  const price = numberFrom(
    PRICE_KEYS.map((key) => record[key]).find((v) => v !== undefined),
  );
  return {
    itemId,
    quantity: quantity !== undefined && quantity > 0 ? quantity : 1,
    price,
  };
}

/**
 * Reads the item references out of an event payload.
 *
 * Two shapes are accepted, matching what Klaviyo and Shopify integrations
 * actually send:
 *
 * - the fast path: an `$items` array (also read as `items`), one entry per line
 *   item, each carrying an id, a quantity and a price;
 * - the slow path: a single `$item_id` on the event itself, for product-view
 *   style calls that only name one item.
 *
 * Returns an empty array for events that have nothing to do with a catalog,
 * which is the overwhelmingly common case.
 */
export function extractCatalogItemRefs(
  properties: Record<string, unknown> | undefined,
): CatalogItemRef[] {
  if (!properties) {
    return [];
  }
  const items = properties.$items ?? properties.items;
  const refs: CatalogItemRef[] = [];
  if (Array.isArray(items)) {
    for (const entry of items.slice(0, MAX_ITEMS_PER_EVENT)) {
      if (!isRecord(entry)) {
        continue;
      }
      const ref = refFrom(entry);
      if (ref) {
        refs.push(ref);
      }
    }
  }
  if (refs.length > 0) {
    return refs;
  }
  const single = refFrom(properties);
  return single ? [single] : [];
}

/** Event names that mean "this profile bought the item". Anything that mentions
 * an order or a purchase counts; the alternative is asking every workspace to
 * hand-configure its taxonomy before a price drop flow is safe to run. */
const PURCHASE_EVENT_PATTERN = /(order|purchase|checkout.?completed|paid)/;
const CART_EVENT_PATTERN = /(cart|basket|checkout)/;
const VIEW_EVENT_PATTERN = /(view|browse|catalog|product)/;

/**
 * Classifies an event into an interest kind.
 *
 * Order matters: a "Started Checkout" mentions checkout and would otherwise be
 * filed as a view. Purchase wins over cart, cart over view, and anything that
 * mentions items but matches nothing is treated as a view — the conservative
 * choice, since a view is the weakest signal and will not suppress a price drop
 * notification the way a purchase does.
 */
export function interestKindFromEventName(event: string): CatalogInterestKind {
  const normalized = event.toLowerCase();
  if (PURCHASE_EVENT_PATTERN.test(normalized)) {
    return CatalogInterestKind.Purchased;
  }
  if (CART_EVENT_PATTERN.test(normalized)) {
    return CatalogInterestKind.Cart;
  }
  if (VIEW_EVENT_PATTERN.test(normalized)) {
    return CatalogInterestKind.Viewed;
  }
  return CatalogInterestKind.Viewed;
}

/** Timestamps arrive as ISO strings from the ingest API and as dates from
 * internal callers; one normalizer keeps both paths writing the same column. */
function toDate(value: string | Date | undefined): Date {
  if (value === undefined) {
    return new Date();
  }
  return value instanceof Date ? value : new Date(value);
}

export interface CatalogItemInterestInput {
  workspaceId: string;
  userId: string;
  event: string;
  properties?: Record<string, unknown>;
  /** Accepts the ISO string the ingest API carries, so callers do not have to
   * convert before handing an event over. */
  timestamp?: string | Date;
}

/**
 * Writes the interest rows implied by one tracking call.
 *
 * Items that no catalog in the workspace knows about are skipped rather than
 * stored: an unknown id is a typo or a catalog that has not synced yet, and
 * keeping it would grow the table with rows nothing can ever match.
 */
export async function recordCatalogItemInterests({
  workspaceId,
  userId,
  event,
  properties,
  timestamp,
}: CatalogItemInterestInput): Promise<number> {
  // Announcements carry `$items` so a flow can render the product block, but
  // they are not user behavior. Counting them would put the profile back into
  // the next price drop audience it was just notified for.
  if (event.startsWith("$catalog_")) {
    return 0;
  }
  const refs = extractCatalogItemRefs(properties);
  if (refs.length === 0) {
    return 0;
  }
  const itemIds = [...new Set(refs.map((ref) => ref.itemId))];
  const knownItems = await db()
    .select({
      catalogId: dbCatalogItem.catalogId,
      itemId: dbCatalogItem.itemId,
    })
    .from(dbCatalogItem)
    .where(
      and(
        eq(dbCatalogItem.workspaceId, workspaceId),
        inArray(dbCatalogItem.itemId, itemIds),
      ),
    );
  if (knownItems.length === 0) {
    return 0;
  }

  const kind = interestKindFromEventName(event);
  const occurredAt = toDate(timestamp);
  const values = knownItems.map(({ catalogId, itemId }) => ({
    workspaceId,
    catalogId,
    userId,
    itemId,
    kind,
    eventCount: 1,
    lastEventAt: occurredAt,
  }));

  // One row per (catalog, user, item, kind). A repeat view refreshes the
  // timestamp instead of appending a row, so the table stays proportional to
  // distinct interest rather than to traffic.
  await db()
    .insert(dbCatalogItemInterest)
    .values(values)
    .onConflictDoUpdate({
      target: [
        dbCatalogItemInterest.catalogId,
        dbCatalogItemInterest.userId,
        dbCatalogItemInterest.itemId,
        dbCatalogItemInterest.kind,
      ],
      set: {
        eventCount: sql`${dbCatalogItemInterest.eventCount} + 1`,
        lastEventAt: occurredAt,
        updatedAt: new Date(),
      },
    });
  return values.length;
}

/**
 * Ids of profiles that should hear about a change to one item.
 *
 * A price drop goes to viewers and carters. Buyers are excluded: they already
 * paid, and telling them the thing got cheaper is a support ticket. Back-in-stock
 * goes only to explicit subscribers who have not been told about this restock.
 */
export async function findPriceDropAudience({
  catalogId,
  itemId,
  limit,
}: {
  catalogId: string;
  itemId: string;
  limit: number;
}): Promise<string[]> {
  const rows = await db()
    .selectDistinct({ userId: dbCatalogItemInterest.userId })
    .from(dbCatalogItemInterest)
    .where(
      and(
        eq(dbCatalogItemInterest.catalogId, catalogId),
        eq(dbCatalogItemInterest.itemId, itemId),
        inArray(dbCatalogItemInterest.kind, [
          CatalogInterestKind.Viewed,
          CatalogInterestKind.Cart,
        ]),
      ),
    )
    .limit(limit);
  return rows.map((row) => row.userId);
}

export async function findRestockAudience({
  catalogId,
  itemId,
  limit,
}: {
  catalogId: string;
  itemId: string;
  limit: number;
}): Promise<string[]> {
  const rows = await db()
    .selectDistinct({ userId: dbCatalogItemInterest.userId })
    .from(dbCatalogItemInterest)
    .where(
      and(
        eq(dbCatalogItemInterest.catalogId, catalogId),
        eq(dbCatalogItemInterest.itemId, itemId),
        eq(dbCatalogItemInterest.kind, CatalogInterestKind.BackInStock),
        isNull(dbCatalogItemInterest.notifiedAt),
      ),
    )
    .limit(limit);
  return rows.map((row) => row.userId);
}

/**
 * Marks the restock subscriptions of one item as notified.
 *
 * The subscription row is kept, not deleted: the user asked to be told when the
 * item came back, so the next time it sells out and returns they should hear
 * about it again without having to re-subscribe.
 */
export async function markRestockNotified({
  catalogId,
  itemId,
  userIds,
  now,
}: {
  catalogId: string;
  itemId: string;
  userIds: string[];
  now: Date;
}): Promise<void> {
  if (userIds.length === 0) {
    return;
  }
  await db()
    .update(dbCatalogItemInterest)
    .set({ notifiedAt: now, updatedAt: now })
    .where(
      and(
        eq(dbCatalogItemInterest.catalogId, catalogId),
        eq(dbCatalogItemInterest.itemId, itemId),
        eq(dbCatalogItemInterest.kind, CatalogInterestKind.BackInStock),
        inArray(dbCatalogItemInterest.userId, userIds),
      ),
    );
}

async function findCatalog({
  workspaceId,
  catalogName,
}: {
  workspaceId: string;
  catalogName: string;
}) {
  const rows = await db()
    .select({ id: dbCatalog.id })
    .from(dbCatalog)
    .where(
      and(
        eq(dbCatalog.workspaceId, workspaceId),
        eq(dbCatalog.name, catalogName),
      ),
    )
    .limit(1);
  return rows[0]?.id;
}

async function catalogHasItem({
  catalogId,
  itemId,
}: {
  catalogId: string;
  itemId: string;
}): Promise<boolean> {
  const rows = await db()
    .select({ itemId: dbCatalogItem.itemId })
    .from(dbCatalogItem)
    .where(
      and(
        eq(dbCatalogItem.catalogId, catalogId),
        eq(dbCatalogItem.itemId, itemId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Creates or refreshes a restock subscription.
 *
 * Subscribing an id the catalog does not contain is rejected rather than stored:
 * it is almost always a typo, and a silent no-op subscription is worse than an
 * error the caller can see.
 */
export async function subscribeToCatalogItem({
  workspaceId,
  catalogName,
  userId,
  itemId,
  now = new Date(),
}: {
  workspaceId: string;
  catalogName: string;
  userId: string;
  itemId: string;
  now?: Date;
}): Promise<Result<void, CatalogError>> {
  const catalogId = await findCatalog({ workspaceId, catalogName });
  if (!catalogId) {
    return err({
      code: "notFound",
      message: `Catalog ${catalogName} not found`,
    });
  }
  if (!(await catalogHasItem({ catalogId, itemId }))) {
    return err({
      code: "notFound",
      message: `Item ${itemId} not found in catalog ${catalogName}`,
    });
  }
  await db()
    .insert(dbCatalogItemInterest)
    .values({
      workspaceId,
      catalogId,
      userId,
      itemId,
      kind: CatalogInterestKind.BackInStock,
      eventCount: 1,
      lastEventAt: now,
    })
    .onConflictDoUpdate({
      target: [
        dbCatalogItemInterest.catalogId,
        dbCatalogItemInterest.userId,
        dbCatalogItemInterest.itemId,
        dbCatalogItemInterest.kind,
      ],
      // Re-subscribing clears the marker: the user is asking to be notified
      // about the next restock, not about the one they were already told about.
      set: { notifiedAt: null, lastEventAt: now, updatedAt: now },
    });
  return ok(undefined);
}

export async function unsubscribeFromCatalogItem({
  workspaceId,
  catalogName,
  userId,
  itemId,
}: {
  workspaceId: string;
  catalogName: string;
  userId: string;
  itemId: string;
}): Promise<Result<void, CatalogError>> {
  const catalogId = await findCatalog({ workspaceId, catalogName });
  if (!catalogId) {
    return err({
      code: "notFound",
      message: `Catalog ${catalogName} not found`,
    });
  }
  await db()
    .delete(dbCatalogItemInterest)
    .where(
      and(
        eq(dbCatalogItemInterest.catalogId, catalogId),
        eq(dbCatalogItemInterest.userId, userId),
        eq(dbCatalogItemInterest.itemId, itemId),
        eq(dbCatalogItemInterest.kind, CatalogInterestKind.BackInStock),
      ),
    );
  return ok(undefined);
}

const INTEREST_KIND_BY_VALUE: Record<string, CatalogInterestKind> =
  Object.fromEntries(
    Object.values(CatalogInterestKind).map((kind) => [kind, kind]),
  );

function interestKindFrom(value: string): CatalogInterestKind {
  return INTEREST_KIND_BY_VALUE[value] ?? CatalogInterestKind.Viewed;
}

/** What one profile has shown interest in, newest first. */
export async function listCatalogItemInterests({
  workspaceId,
  catalogName,
  userId,
  limit = 100,
}: {
  workspaceId: string;
  catalogName: string;
  userId: string;
  limit?: number;
}): Promise<Result<CatalogItemInterestResource[], CatalogError>> {
  const catalogId = await findCatalog({ workspaceId, catalogName });
  if (!catalogId) {
    return err({
      code: "notFound",
      message: `Catalog ${catalogName} not found`,
    });
  }
  const rows = await db()
    .select()
    .from(dbCatalogItemInterest)
    .where(
      and(
        eq(dbCatalogItemInterest.catalogId, catalogId),
        eq(dbCatalogItemInterest.userId, userId),
      ),
    )
    .orderBy(desc(dbCatalogItemInterest.lastEventAt))
    .limit(limit);
  return ok(
    rows.map((row) => ({
      itemId: row.itemId,
      kind: interestKindFrom(row.kind),
      eventCount: row.eventCount,
      lastEventAt: row.lastEventAt.getTime(),
      notifiedAt: row.notifiedAt?.getTime(),
    })),
  );
}

/**
 * Profiles that bought an item, used to keep price drop announcements honest
 * even when a flow is configured without a purchase exclusion segment.
 */
export async function itemBuyerIds({
  catalogId,
  itemId,
  userIds,
}: {
  catalogId: string;
  itemId: string;
  userIds: string[];
}): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }
  const rows = await db()
    .selectDistinct({ userId: dbCatalogItemInterest.userId })
    .from(dbCatalogItemInterest)
    .where(
      and(
        eq(dbCatalogItemInterest.catalogId, catalogId),
        eq(dbCatalogItemInterest.itemId, itemId),
        eq(dbCatalogItemInterest.kind, CatalogInterestKind.Purchased),
        inArray(dbCatalogItemInterest.userId, userIds),
      ),
    );
  return new Set(rows.map((row) => row.userId));
}

/** Items in a catalog that currently have at least one pending restock
 * subscription. Used to decide which items a sync needs to look at closely. */
export async function itemsWithRestockSubscriptions({
  catalogId,
  itemIds,
}: {
  catalogId: string;
  itemIds: string[];
}): Promise<Set<string>> {
  if (itemIds.length === 0) {
    return new Set();
  }
  const rows = await db()
    .selectDistinct({ itemId: dbCatalogItemInterest.itemId })
    .from(dbCatalogItemInterest)
    .where(
      and(
        eq(dbCatalogItemInterest.catalogId, catalogId),
        inArray(dbCatalogItemInterest.itemId, itemIds),
        eq(dbCatalogItemInterest.kind, CatalogInterestKind.BackInStock),
        isNull(dbCatalogItemInterest.notifiedAt),
      ),
    );
  return new Set(rows.map((row) => row.itemId));
}
