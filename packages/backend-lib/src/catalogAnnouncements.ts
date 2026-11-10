/* eslint-disable no-await-in-loop */
// Announcements are emitted serially on purpose: each item's audience lookup
// waits for the previous item's batch to be accepted, which bounds both the
// connection pool usage and the blast radius of a bad payload.
import { randomUUID } from "crypto";
import { EventType } from "isomorphic-lib/src/types";

import { submitBatchWithTriggers } from "./apps";
import {
  findPriceDropAudience,
  findRestockAudience,
  itemBuyerIds,
  markRestockNotified,
} from "./catalogInterests";
import logger from "./logger";

/**
 * Turning a catalog change into an event.
 *
 * A sync knows that item `JF-1` went from 49.95 to 39.95. Flows do not listen to
 * catalogs, they listen to events, and they need one event per profile so the
 * normal journey machinery (entry node, segment filters, delays) applies without
 * a new node type.
 *
 * So the sync emits `$catalog_price_drop` / `$catalog_back_in_stock` as ordinary
 * track calls for each profile that cares about the item. Everything downstream
 * — dedupe, rate limits, exclusions, the message itself — is the existing
 * journey pipeline.
 */

export const PRICE_DROP_EVENT = "$catalog_price_drop";
export const BACK_IN_STOCK_EVENT = "$catalog_back_in_stock";

/**
 * Minimum restock size worth announcing. One unit coming back is usually a
 * cancelled order, not a restock, and notifying the whole waitlist for it
 * trains people to ignore the message.
 */
export const DEFAULT_RESTOCK_MIN_QUANTITY = 1;

/**
 * Ceiling on how many profiles one sync will notify about one item. A catalog
 * with a very popular item can otherwise turn a single price change into
 * hundreds of thousands of events in one tick.
 */
export const MAX_ANNOUNCEMENTS_PER_ITEM = 5_000;

/** Events per `submitBatch` call. Large enough to amortise the insert, small
 * enough that one bad payload does not take a whole catalog down. */
const ANNOUNCEMENT_BATCH_SIZE = 500;

export interface CatalogItemChange {
  itemId: string;
  type: "priceDrop" | "backInStock";
  title?: string;
  parentItemId?: string;
  url?: string;
  imageUrl?: string;
  currency?: string;
  previousPrice?: number;
  price?: number;
  inventoryQuantity?: number;
}

export interface AnnouncementSummary {
  priceDropEvents: number;
  backInStockEvents: number;
}

function changeProperties(
  catalogId: string,
  change: CatalogItemChange,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    $catalog_id: catalogId,
    $item_id: change.itemId,
    itemId: change.itemId,
    itemType: change.parentItemId ? "variant" : "product",
    // Rendered by travel through the same `catalogs` liquid scope as any other
    // product block, so a flow can show the item without a second lookup.
    $items: [
      {
        itemId: change.itemId,
        title: change.title,
        price: change.price,
        quantity: 1,
      },
    ],
  };
  if (change.title !== undefined) {
    properties.title = change.title;
  }
  if (change.parentItemId !== undefined) {
    properties.parentItemId = change.parentItemId;
  }
  if (change.url !== undefined) {
    properties.url = change.url;
  }
  if (change.imageUrl !== undefined) {
    properties.imageUrl = change.imageUrl;
  }
  if (change.currency !== undefined) {
    properties.currency = change.currency;
  }
  if (change.price !== undefined) {
    properties.price = change.price;
  }
  if (change.previousPrice !== undefined) {
    properties.previousPrice = change.previousPrice;
    if (change.price !== undefined && change.previousPrice > 0) {
      properties.priceDropPercent = Number(
        (
          ((change.previousPrice - change.price) / change.previousPrice) *
          100
        ).toFixed(2),
      );
    }
  }
  return properties;
}

async function emitForAudience({
  workspaceId,
  catalogId,
  event,
  change,
  userIds,
  now,
}: {
  workspaceId: string;
  catalogId: string;
  event: string;
  change: CatalogItemChange;
  userIds: string[];
  now: Date;
}): Promise<number> {
  if (userIds.length === 0) {
    return 0;
  }
  const properties = changeProperties(catalogId, change);
  const timestamp = now.toISOString();
  let sent = 0;
  for (
    let offset = 0;
    offset < userIds.length;
    offset += ANNOUNCEMENT_BATCH_SIZE
  ) {
    const slice = userIds.slice(offset, offset + ANNOUNCEMENT_BATCH_SIZE);
    const batch = slice.map((userId) => ({
      type: EventType.Track as const,
      event,
      userId,
      timestamp,
      messageId: randomUUID(),
      properties,
    }));
    // Goes through the normal ingestion path on purpose: these events need to be
    // queryable by segments and to start journeys, exactly like a call from the
    // customer's website.
    await submitBatchWithTriggers({
      workspaceId,
      data: { batch, context: {} },
    });
    sent += slice.length;
  }
  return sent;
}

/**
 * Emits the events implied by a set of catalog changes.
 *
 * Never throws: a sync that successfully wrote a catalog must not be reported as
 * failed because a notification could not be queued. Announcement problems are
 * logged and the sync still records its rows.
 */
export async function announceCatalogItemChanges({
  workspaceId,
  catalogId,
  changes,
  now = new Date(),
}: {
  workspaceId: string;
  catalogId: string;
  changes: CatalogItemChange[];
  now?: Date;
}): Promise<AnnouncementSummary> {
  const summary: AnnouncementSummary = {
    priceDropEvents: 0,
    backInStockEvents: 0,
  };
  for (const change of changes) {
    try {
      // eslint-disable-next-line no-await-in-loop
      if (change.type === "priceDrop") {
        const audience = await findPriceDropAudience({
          catalogId,
          itemId: change.itemId,
          limit: MAX_ANNOUNCEMENTS_PER_ITEM,
        });
        // Belt and braces: even if the flow was configured without a buyer
        // exclusion, someone who already bought at the old price should not be
        // told it got cheaper.
        const buyers = await itemBuyerIds({
          catalogId,
          itemId: change.itemId,
          userIds: audience,
        });
        const targets = audience.filter((userId) => !buyers.has(userId));
        summary.priceDropEvents += await emitForAudience({
          workspaceId,
          catalogId,
          event: PRICE_DROP_EVENT,
          change,
          userIds: targets,
          now,
        });
      } else {
        const minQuantity =
          change.inventoryQuantity === undefined
            ? DEFAULT_RESTOCK_MIN_QUANTITY
            : change.inventoryQuantity;
        if (minQuantity < DEFAULT_RESTOCK_MIN_QUANTITY) {
          continue;
        }
        const audience = await findRestockAudience({
          catalogId,
          itemId: change.itemId,
          limit: MAX_ANNOUNCEMENTS_PER_ITEM,
        });
        if (audience.length === 0) {
          continue;
        }
        summary.backInStockEvents += await emitForAudience({
          workspaceId,
          catalogId,
          event: BACK_IN_STOCK_EVENT,
          change,
          userIds: audience,
          now,
        });
        await markRestockNotified({
          catalogId,
          itemId: change.itemId,
          userIds: audience,
          now,
        });
      }
    } catch (error) {
      logger().error(
        { err: error, catalogId, itemId: change.itemId, change: change.type },
        "Failed to announce catalog item change",
      );
    }
  }
  return summary;
}
