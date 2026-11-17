import { randomUUID } from "crypto";
import {
  CatalogInterestKind,
  CatalogItemStatus,
  CatalogItemType,
} from "isomorphic-lib/src/catalog";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import {
  extractCatalogItemRefs,
  findPriceDropAudience,
  findRestockAudience,
  interestKindFromEventName,
  itemBuyerIds,
  itemsWithRestockSubscriptions,
  listCatalogItemInterests,
  markRestockNotified,
  recordCatalogItemInterests,
  subscribeToCatalogItem,
  unsubscribeFromCatalogItem,
} from "./catalogInterests";
import { upsertCatalog, upsertCatalogItems } from "./catalogs";
import { detectCatalogItemChanges, ItemSnapshot } from "./catalogSync";
import { insert } from "./db";
import { workspace as dbWorkspace } from "./db/schema";
import { Workspace } from "./types";

describe("catalogInterests", () => {
  describe("extractCatalogItemRefs", () => {
    it("reads an $items array with the field names integrations actually send", () => {
      expect(
        extractCatalogItemRefs({
          $items: [
            { $item_id: "v-1", $quantity: 2, $price: "19,95" },
            { sku: "v-2", quantity: 1 },
            { productId: 1234 },
            { unrelated: true },
          ],
        }),
      ).toEqual([
        { itemId: "v-1", quantity: 2, price: 19.95 },
        { itemId: "v-2", quantity: 1, price: undefined },
        { itemId: "1234", quantity: 1, price: undefined },
      ]);
    });

    it("falls back to a single $item_id on the event", () => {
      expect(extractCatalogItemRefs({ $item_id: "p-1", price: 12 })).toEqual([
        { itemId: "p-1", quantity: 1, price: 12 },
      ]);
    });

    it("returns nothing for events without item references", () => {
      expect(extractCatalogItemRefs({ plan: "pro" })).toEqual([]);
      expect(extractCatalogItemRefs(undefined)).toEqual([]);
      expect(extractCatalogItemRefs({ $items: "not-an-array" })).toEqual([]);
    });

    it("caps the number of items read from one event", () => {
      const items = Array.from({ length: 250 }, (_, index) => ({
        itemId: `item-${index}`,
      }));
      expect(extractCatalogItemRefs({ $items: items })).toHaveLength(100);
    });
  });

  describe("interestKindFromEventName", () => {
    it("classifies purchases before carts, and carts before views", () => {
      expect(interestKindFromEventName("Placed Order")).toBe(
        CatalogInterestKind.Purchased,
      );
      expect(interestKindFromEventName("Ordered Product")).toBe(
        CatalogInterestKind.Purchased,
      );
      expect(interestKindFromEventName("Started Checkout")).toBe(
        CatalogInterestKind.Cart,
      );
      expect(interestKindFromEventName("Added to Cart")).toBe(
        CatalogInterestKind.Cart,
      );
      expect(interestKindFromEventName("Viewed Product")).toBe(
        CatalogInterestKind.Viewed,
      );
    });

    it("treats an unrecognized event carrying items as a view", () => {
      expect(interestKindFromEventName("Widget Impression")).toBe(
        CatalogInterestKind.Viewed,
      );
    });
  });

  describe("detectCatalogItemChanges", () => {
    const snapshot = (overrides: Partial<ItemSnapshot> = {}): ItemSnapshot => ({
      itemId: "v-1",
      title: "Court Pump",
      parentItemId: null,
      url: null,
      imageUrl: null,
      currency: "EUR",
      price: 49.95,
      inventoryQuantity: 3,
      inStock: true,
      ...overrides,
    });

    it("reports a price drop with the previous price", () => {
      const changes = detectCatalogItemChanges({
        before: new Map([["v-1", snapshot()]]),
        after: new Map([["v-1", snapshot({ price: 39.95 })]]),
      });
      expect(changes).toEqual([
        expect.objectContaining({
          itemId: "v-1",
          type: "priceDrop",
          previousPrice: 49.95,
          price: 39.95,
        }),
      ]);
    });

    it("ignores a price increase and rounding noise", () => {
      expect(
        detectCatalogItemChanges({
          before: new Map([["v-1", snapshot()]]),
          after: new Map([["v-1", snapshot({ price: 59.95 })]]),
        }),
      ).toEqual([]);
      expect(
        detectCatalogItemChanges({
          before: new Map([["v-1", snapshot()]]),
          after: new Map([["v-1", snapshot({ price: 49.951 })]]),
        }),
      ).toEqual([]);
    });

    it("reports a restock when an item becomes buyable", () => {
      const changes = detectCatalogItemChanges({
        before: new Map([
          ["v-1", snapshot({ inStock: false, inventoryQuantity: 0 })],
        ]),
        after: new Map([
          ["v-1", snapshot({ inStock: true, inventoryQuantity: 4 })],
        ]),
      });
      expect(changes).toEqual([
        expect.objectContaining({ itemId: "v-1", type: "backInStock" }),
      ]);
    });

    it("reports a restock when backorders kept a zero-stock item on sale", () => {
      const changes = detectCatalogItemChanges({
        before: new Map([["v-1", snapshot({ inventoryQuantity: 0 })]]),
        after: new Map([["v-1", snapshot({ inventoryQuantity: 6 })]]),
      });
      expect(changes).toEqual([
        expect.objectContaining({ type: "backInStock", inventoryQuantity: 6 }),
      ]);
    });

    it("ignores items that were not in the catalog before the sync", () => {
      expect(
        detectCatalogItemChanges({
          before: new Map(),
          after: new Map([["v-1", snapshot()]]),
        }),
      ).toEqual([]);
    });

    it("reports a price drop and a restock separately", () => {
      // A restock at a lower price is two pieces of news with two different
      // audiences, so neither may swallow the other.
      const changes = detectCatalogItemChanges({
        before: new Map([
          ["v-1", snapshot({ inStock: false, inventoryQuantity: 0 })],
        ]),
        after: new Map([
          ["v-1", snapshot({ price: 39.95, inventoryQuantity: 5 })],
        ]),
      });
      expect(changes.map((change) => change.type).sort()).toEqual([
        "backInStock",
        "priceDrop",
      ]);
    });
  });

  describe("interest storage", () => {
    let workspace: Workspace;
    let catalogId: string;

    beforeEach(async () => {
      workspace = unwrap(
        await insert({
          table: dbWorkspace,
          values: {
            id: randomUUID(),
            name: `workspace-${randomUUID()}`,
            updatedAt: new Date(),
          },
        }),
      );
      const catalog = unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "shop" }),
      );
      catalogId = catalog.id;
      unwrap(
        await upsertCatalogItems({
          workspaceId: workspace.id,
          catalogName: "shop",
          items: [
            { itemId: "v-1", title: "Court Pump", price: 49.95 },
            { itemId: "v-2", title: "Ankle Boot", price: 149.95 },
            {
              itemId: "v-3",
              title: "Retired Tote",
              status: CatalogItemStatus.Archived,
              itemType: CatalogItemType.Product,
            },
          ],
        }),
      );
    });

    it("records an interest row for an item the catalog knows", async () => {
      const recorded = await recordCatalogItemInterests({
        workspaceId: workspace.id,
        userId: "user-1",
        event: "Viewed Product",
        properties: { $item_id: "v-1" },
      });
      expect(recorded).toBe(1);
      const interests = unwrap(
        await listCatalogItemInterests({
          workspaceId: workspace.id,
          catalogName: "shop",
          userId: "user-1",
        }),
      );
      expect(interests).toEqual([
        expect.objectContaining({
          itemId: "v-1",
          kind: CatalogInterestKind.Viewed,
          eventCount: 1,
        }),
      ]);
    });

    it("increments the counter instead of appending a second row", async () => {
      await recordCatalogItemInterests({
        workspaceId: workspace.id,
        userId: "user-1",
        event: "Viewed Product",
        properties: { $item_id: "v-1" },
      });
      await recordCatalogItemInterests({
        workspaceId: workspace.id,
        userId: "user-1",
        event: "Viewed Product",
        properties: { $item_id: "v-1" },
      });
      const interests = unwrap(
        await listCatalogItemInterests({
          workspaceId: workspace.id,
          catalogName: "shop",
          userId: "user-1",
        }),
      );
      expect(interests).toHaveLength(1);
      expect(interests[0]?.eventCount).toBe(2);
    });

    it("does not count the catalog's own announcements as interest", async () => {
      const recorded = await recordCatalogItemInterests({
        workspaceId: workspace.id,
        userId: "viewer",
        event: "$catalog_price_drop",
        properties: { $items: [{ itemId: "v-1" }] },
      });
      expect(recorded).toBe(0);
      expect(
        await findPriceDropAudience({ catalogId, itemId: "v-1", limit: 100 }),
      ).toEqual([]);
    });

    it("skips item ids no catalog knows", async () => {
      const recorded = await recordCatalogItemInterests({
        workspaceId: workspace.id,
        userId: "user-1",
        event: "Viewed Product",
        properties: { $item_id: "ghost" },
      });
      expect(recorded).toBe(0);
      const interests = unwrap(
        await listCatalogItemInterests({
          workspaceId: workspace.id,
          catalogName: "shop",
          userId: "user-1",
        }),
      );
      expect(interests).toEqual([]);
    });

    it("keeps a purchase out of the price drop audience", async () => {
      await recordCatalogItemInterests({
        workspaceId: workspace.id,
        userId: "buyer",
        event: "Placed Order",
        properties: { $items: [{ itemId: "v-1", quantity: 1 }] },
      });
      await recordCatalogItemInterests({
        workspaceId: workspace.id,
        userId: "browser",
        event: "Viewed Product",
        properties: { $items: [{ itemId: "v-1" }] },
      });
      await recordCatalogItemInterests({
        workspaceId: workspace.id,
        userId: "carter",
        event: "Added to Cart",
        properties: { $items: [{ itemId: "v-1" }] },
      });

      const audience = await findPriceDropAudience({
        catalogId,
        itemId: "v-1",
        limit: 100,
      });
      expect(audience.sort()).toEqual(["browser", "carter"]);
      expect(
        (await itemBuyerIds({ catalogId, itemId: "v-1", userIds: audience }))
          .size,
      ).toBe(0);
      expect(
        (
          await itemBuyerIds({
            catalogId,
            itemId: "v-1",
            userIds: ["buyer"],
          })
        ).has("buyer"),
      ).toBe(true);
    });

    it("subscribes a profile to a restock and clears the marker on re-subscribe", async () => {
      const subscribed = await subscribeToCatalogItem({
        workspaceId: workspace.id,
        catalogName: "shop",
        userId: "user-1",
        itemId: "v-2",
      });
      expect(subscribed.isOk()).toBe(true);

      expect(
        await findRestockAudience({ catalogId, itemId: "v-2", limit: 100 }),
      ).toEqual(["user-1"]);
      expect(
        await itemsWithRestockSubscriptions({ catalogId, itemIds: ["v-2"] }),
      ).toEqual(new Set(["v-2"]));

      await markRestockNotified({
        catalogId,
        itemId: "v-2",
        userIds: ["user-1"],
        now: new Date(),
      });
      // A notified subscriber is no longer pending, but the row survives so the
      // next restock reaches them again.
      expect(
        await findRestockAudience({ catalogId, itemId: "v-2", limit: 100 }),
      ).toEqual([]);
      expect(
        await itemsWithRestockSubscriptions({ catalogId, itemIds: ["v-2"] }),
      ).toEqual(new Set());

      await subscribeToCatalogItem({
        workspaceId: workspace.id,
        catalogName: "shop",
        userId: "user-1",
        itemId: "v-2",
      });
      expect(
        await findRestockAudience({ catalogId, itemId: "v-2", limit: 100 }),
      ).toEqual(["user-1"]);
    });

    it("rejects a subscription for a catalog or item that does not exist", async () => {
      const missingCatalog = await subscribeToCatalogItem({
        workspaceId: workspace.id,
        catalogName: "nope",
        userId: "user-1",
        itemId: "v-1",
      });
      expect(missingCatalog.isErr() && missingCatalog.error.code).toBe(
        "notFound",
      );

      const missingItem = await subscribeToCatalogItem({
        workspaceId: workspace.id,
        catalogName: "shop",
        userId: "user-1",
        itemId: "ghost",
      });
      expect(missingItem.isErr() && missingItem.error.code).toBe("notFound");
    });

    it("unsubscribes from a restock notification", async () => {
      await subscribeToCatalogItem({
        workspaceId: workspace.id,
        catalogName: "shop",
        userId: "user-1",
        itemId: "v-2",
      });
      unwrap(
        await unsubscribeFromCatalogItem({
          workspaceId: workspace.id,
          catalogName: "shop",
          userId: "user-1",
          itemId: "v-2",
        }),
      );
      expect(
        await findRestockAudience({ catalogId, itemId: "v-2", limit: 100 }),
      ).toEqual([]);
    });

    it("does not treat a restock subscription as a price drop target", async () => {
      await subscribeToCatalogItem({
        workspaceId: workspace.id,
        catalogName: "shop",
        userId: "user-1",
        itemId: "v-2",
      });
      expect(
        await findPriceDropAudience({ catalogId, itemId: "v-2", limit: 100 }),
      ).toEqual([]);
    });
  });
});
