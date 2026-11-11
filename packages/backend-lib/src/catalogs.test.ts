import { randomUUID } from "crypto";
import {
  CatalogFilterOperatorType,
  CatalogInventoryPolicy,
  CatalogItemStatus,
  CatalogItemType,
  CatalogSyncKind,
} from "isomorphic-lib/src/catalog";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import {
  completeCatalogSync,
  deleteCatalog,
  deleteCatalogCollection,
  deleteCatalogItems,
  extractCatalogCollectionNames,
  listCatalogCategories,
  listCatalogCollections,
  listCatalogItems,
  listCatalogs,
  listCatalogSyncRuns,
  loadCatalogsForTemplates,
  previewCatalogCollection,
  purgeArchivedCatalogItems,
  readCatalog,
  resolveCatalogCollections,
  upsertCatalog,
  upsertCatalogCollection,
  upsertCatalogItems,
} from "./catalogs";
import { insert } from "./db";
import { workspace as dbWorkspace } from "./db/schema";
import { Workspace } from "./types";

describe("catalogs", () => {
  let workspace: Workspace;

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
  });

  describe("extractCatalogCollectionNames", () => {
    it("finds collection names in double and single quotes", () => {
      const template = `
        {% catalog_collection "BestSellerShoes" as items %}{% endcatalog_collection %}
        {%- catalog_collection 'Trending' as trend -%}{% endcatalog_collection %}
      `;
      expect(extractCatalogCollectionNames(template)).toEqual([
        "BestSellerShoes",
        "Trending",
      ]);
    });

    it("returns no names for templates without the tag", () => {
      expect(extractCatalogCollectionNames("{{ user.firstName }}")).toEqual([]);
    });

    it("ignores tags inside comment and raw blocks", () => {
      const template = `
        {% comment %}{% catalog_collection "Hidden" as a %}{% endcomment %}
        {% raw %}{% catalog_collection "AlsoHidden" as b %}{% endraw %}
        {% catalog_collection "Visible" as c %}{% endcatalog_collection %}
      `;
      expect(extractCatalogCollectionNames(template)).toEqual(["Visible"]);
    });
  });

  describe("upsertCatalog", () => {
    it("creates a catalog with its defaults", async () => {
      const catalog = unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "products" }),
      );
      expect(catalog.itemCount).toBe(0);
      expect(catalog.sourceType).toBe("api");
      expect(catalog.currency).toBe("USD");
      expect(catalog.syncStatus).toBe("never");
    });

    it("is idempotent by name", async () => {
      unwrap(await upsertCatalog({ workspaceId: workspace.id, name: "p" }));
      const again = unwrap(
        await upsertCatalog({
          workspaceId: workspace.id,
          name: "p",
          currency: "EUR",
        }),
      );
      expect(again.currency).toBe("EUR");
      expect(await listCatalogs({ workspaceId: workspace.id })).toHaveLength(1);
    });
  });

  describe("item writes", () => {
    beforeEach(async () => {
      unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "products" }),
      );
    });

    it("writes typed fields and reports the item count", async () => {
      const result = unwrap(
        await upsertCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          items: [
            { itemId: "sku-1", title: "Shoe", price: 20, inventoryQuantity: 5 },
            { itemId: "sku-2", title: "Bag", price: 50 },
          ],
        }),
      );
      expect(result).toEqual({
        upsertedCount: 2,
        deletedCount: 0,
        itemCount: 2,
        skippedCount: 0,
      });

      const catalogs = await listCatalogs({ workspaceId: workspace.id });
      expect(catalogs[0]?.itemCount).toBe(2);
      expect(catalogs[0]?.syncStatus).toBe("ok");
    });

    it("merges omitted columns instead of nulling them", async () => {
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [{ itemId: "sku-1", title: "Shoe", price: 20 }],
      });
      // A content-only update that says nothing about price must not clear it.
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [{ itemId: "sku-1", title: "Boot" }],
      });
      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
        }),
      );
      expect(items.items[0]?.title).toBe("Boot");
      expect(items.items[0]?.price).toBe(20);
    });

    it("treats a missing inventory quantity as in stock", async () => {
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [{ itemId: "sku-1", title: "Shoe" }],
      });
      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
        }),
      );
      expect(items.items[0]?.inStock).toBe(true);
    });

    it("marks an item out of stock when quantity reaches zero", async () => {
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [{ itemId: "sku-1", inventoryQuantity: 0 }],
      });
      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
        }),
      );
      expect(items.items[0]?.inStock).toBe(false);
    });

    it("keeps a backorderable item buyable at zero inventory", async () => {
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [
          {
            itemId: "sku-1",
            inventoryQuantity: 0,
            inventoryPolicy: CatalogInventoryPolicy.Continue,
          },
        ],
      });
      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
        }),
      );
      expect(items.items[0]?.inStock).toBe(true);
    });

    it("deletes items missing from the request when replace is set", async () => {
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [{ itemId: "sku-1" }, { itemId: "sku-2" }],
      });
      const result = unwrap(
        await upsertCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          items: [{ itemId: "sku-1" }],
          replace: true,
        }),
      );
      expect(result.deletedCount).toBe(1);
      expect(result.itemCount).toBe(1);
    });

    it("rejects replace together with syncId", async () => {
      const result = await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [{ itemId: "sku-1" }],
        replace: true,
        syncId: "s1",
      });
      expect(result.isErr()).toBe(true);
    });

    it("fails when the catalog does not exist", async () => {
      const result = await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "missing",
        items: [{ itemId: "sku-1" }],
      });
      expect(result.isErr()).toBe(true);
    });

    it("deletes the requested items", async () => {
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [{ itemId: "sku-1" }, { itemId: "sku-2" }],
      });
      const result = unwrap(
        await deleteCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          itemIds: ["sku-2"],
        }),
      );
      expect(result.deletedCount).toBe(1);
    });
  });

  describe("products and variants", () => {
    beforeEach(async () => {
      unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "products" }),
      );
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [
          {
            itemId: "shoe",
            itemType: CatalogItemType.Product,
            title: "Court Pump",
          },
          {
            itemId: "shoe-38",
            itemType: CatalogItemType.Variant,
            parentItemId: "shoe",
            price: 49.95,
            inventoryQuantity: 0,
          },
          {
            itemId: "shoe-39",
            itemType: CatalogItemType.Variant,
            parentItemId: "shoe",
            price: 79.95,
            inventoryQuantity: 4,
          },
        ],
      });
    });

    it("rolls variant price and inventory up onto the product", async () => {
      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          itemType: CatalogItemType.Product,
        }),
      );
      const product = items.items[0];
      expect(product?.priceMin).toBe(49.95);
      expect(product?.priceMax).toBe(79.95);
      expect(product?.inventoryTotal).toBe(4);
      expect(product?.variantCount).toBe(2);
      // One variant is buyable, so the product is buyable.
      expect(product?.inStock).toBe(true);
    });

    it("lists the variants of a product", async () => {
      const variants = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          parentItemId: "shoe",
        }),
      );
      expect(variants.items.map((item) => item.itemId)).toEqual([
        "shoe-38",
        "shoe-39",
      ]);
    });

    it("recomputes the product when a variant runs out", async () => {
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        kind: CatalogSyncKind.Inventory,
        items: [{ itemId: "shoe-39", inventoryQuantity: 0 }],
      });
      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          itemType: CatalogItemType.Product,
        }),
      );
      expect(items.items[0]?.inventoryTotal).toBe(0);
      expect(items.items[0]?.inStock).toBe(false);
    });
  });

  describe("price and inventory syncs", () => {
    beforeEach(async () => {
      unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "products" }),
      );
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [
          { itemId: "sku-1", title: "Shoe", price: 20, inventoryQuantity: 3 },
        ],
      });
    });

    it("updates price without touching inventory or title", async () => {
      const result = unwrap(
        await upsertCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          kind: CatalogSyncKind.Price,
          items: [{ itemId: "sku-1", price: 15 }],
        }),
      );
      expect(result.upsertedCount).toBe(1);
      expect(result.skippedCount).toBe(0);

      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
        }),
      );
      expect(items.items[0]?.price).toBe(15);
      expect(items.items[0]?.inventoryQuantity).toBe(3);
      expect(items.items[0]?.title).toBe("Shoe");
    });

    it("updates inventory without touching price", async () => {
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        kind: CatalogSyncKind.Inventory,
        items: [{ itemId: "sku-1", inventoryQuantity: 0 }],
      });
      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
        }),
      );
      expect(items.items[0]?.inventoryQuantity).toBe(0);
      expect(items.items[0]?.inStock).toBe(false);
      expect(items.items[0]?.price).toBe(20);
    });

    it("records per-channel freshness", async () => {
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        kind: CatalogSyncKind.Price,
        items: [{ itemId: "sku-1", price: 11 }],
      });
      const catalog = unwrap(
        await readCatalog({ workspaceId: workspace.id, name: "products" }),
      );
      expect(catalog.lastPriceSyncedAt).toBeGreaterThan(0);
      expect(catalog.lastInventorySyncedAt).toBeUndefined();
    });

    it("never creates an unknown item and reports it as skipped", async () => {
      const result = unwrap(
        await upsertCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          kind: CatalogSyncKind.Price,
          items: [
            { itemId: "sku-1", price: 15 },
            { itemId: "ghost", price: 99 },
          ],
        }),
      );
      expect(result.upsertedCount).toBe(1);
      expect(result.skippedCount).toBe(1);
      expect(result.itemCount).toBe(1);

      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
        }),
      );
      expect(items.items).toHaveLength(1);
    });

    it("rejects a price sync that matches nothing", async () => {
      const result = await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        kind: CatalogSyncKind.Price,
        items: [{ itemId: "ghost", price: 99 }],
      });
      expect(result.isErr()).toBe(true);
    });

    it("rejects replace on a price sync", async () => {
      const result = await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        kind: CatalogSyncKind.Price,
        items: [{ itemId: "sku-1", price: 1 }],
        replace: true,
      });
      expect(result.isErr()).toBe(true);
    });

    it("logs the run", async () => {
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        kind: CatalogSyncKind.Price,
        items: [{ itemId: "sku-1", price: 12 }],
      });
      const runs = unwrap(
        await listCatalogSyncRuns({
          workspaceId: workspace.id,
          catalogName: "products",
        }),
      );
      expect(runs.map((run) => run.kind)).toEqual(["price", "items"]);
      expect(runs[0]?.status).toBe("ok");
    });
  });

  describe("sync completion", () => {
    beforeEach(async () => {
      unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "products" }),
      );
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [{ itemId: "a" }, { itemId: "b" }],
      });
    });

    it("archives instead of deleting items a sync stopped mentioning", async () => {
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [{ itemId: "a" }],
        syncId: "run-1",
      });
      const result = unwrap(
        await completeCatalogSync({
          workspaceId: workspace.id,
          catalogName: "products",
          syncId: "run-1",
        }),
      );
      expect(result.archivedCount).toBe(1);
      expect(result.itemCount).toBe(1);

      const archived = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          status: CatalogItemStatus.Archived,
        }),
      );
      expect(archived.items.map((item) => item.itemId)).toEqual(["b"]);
    });

    it("refuses to archive when the sync id is unknown", async () => {
      const result = await completeCatalogSync({
        workspaceId: workspace.id,
        catalogName: "products",
        syncId: "typo",
      });
      expect(result.isErr()).toBe(true);
    });

    it("purges archived items only after the grace period", async () => {
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [{ itemId: "a" }],
        syncId: "run-1",
      });
      unwrap(
        await completeCatalogSync({
          workspaceId: workspace.id,
          catalogName: "products",
          syncId: "run-1",
        }),
      );
      const catalog = unwrap(
        await readCatalog({ workspaceId: workspace.id, name: "products" }),
      );
      // Not yet past the default grace period.
      expect(await purgeArchivedCatalogItems({ catalogId: catalog.id })).toBe(
        0,
      );
      // With no grace at all, the tombstone is collected.
      expect(
        await purgeArchivedCatalogItems({
          catalogId: catalog.id,
          graceDays: -1,
        }),
      ).toBe(1);
    });
  });

  describe("listCatalogItems", () => {
    it("paginates with a cursor", async () => {
      unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "products" }),
      );
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: ["a", "b", "c"].map((itemId) => ({ itemId })),
      });

      const firstPage = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          limit: 2,
        }),
      );
      expect(firstPage.items.map((item) => item.itemId)).toEqual(["a", "b"]);
      expect(firstPage.itemCount).toBe(3);
      expect(firstPage.nextCursor).toBe("b");

      const secondPage = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          limit: 2,
          cursor: firstPage.nextCursor,
        }),
      );
      expect(secondPage.items.map((item) => item.itemId)).toEqual(["c"]);
      expect(secondPage.nextCursor).toBeUndefined();
    });
  });

  describe("categories", () => {
    it("counts items per category", async () => {
      unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "products" }),
      );
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [
          { itemId: "a", categories: ["Shoes", "Sale"] },
          { itemId: "b", categories: ["Shoes"] },
          { itemId: "c", categories: ["Bags"] },
        ],
      });
      const categories = unwrap(
        await listCatalogCategories({
          workspaceId: workspace.id,
          catalogName: "products",
        }),
      );
      expect(categories).toEqual([
        { name: "Shoes", itemCount: 2 },
        { name: "Bags", itemCount: 1 },
        { name: "Sale", itemCount: 1 },
      ]);
    });
  });

  describe("collections", () => {
    const products = [
      {
        itemId: "shoe-1",
        title: "Court Pump",
        price: 20,
        inventoryQuantity: 5,
        categories: ["Shoes"],
        tags: ["bestseller", "sale"],
        attributes: { GENDER: "Women" },
      },
      {
        itemId: "shoe-2",
        title: "Ankle Boot",
        price: 80,
        inventoryQuantity: 2,
        categories: ["Shoes"],
        tags: ["new"],
        attributes: { GENDER: "Women" },
      },
      {
        itemId: "bag-1",
        title: "Tote",
        price: 60,
        inventoryQuantity: 1,
        categories: ["Bags"],
        tags: ["bestseller"],
        attributes: { GENDER: "Women" },
      },
      {
        itemId: "shoe-3",
        title: "Sold Out Boot",
        price: 90,
        inventoryQuantity: 0,
        categories: ["Shoes"],
        tags: ["bestseller"],
        attributes: { GENDER: "Women" },
      },
    ];

    beforeEach(async () => {
      unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "products" }),
      );
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: products,
      });
    });

    it("filters, sorts and limits", async () => {
      const result = unwrap(
        await previewCatalogCollection({
          workspaceId: workspace.id,
          catalogName: "products",
          definition: {
            filter: {
              type: "Field",
              field: "categories",
              operator: CatalogFilterOperatorType.Contains,
              value: "Shoes",
            },
            sort: [{ field: "price", direction: "desc" }],
            limit: 2,
          },
        }),
      );
      // shoe-3 is the most expensive but is out of stock, so it is excluded.
      expect(result.items.map((item) => item.itemId)).toEqual([
        "shoe-2",
        "shoe-1",
      ]);
      expect(result.itemCount).toBe(2);
      expect(result.returnedCount).toBe(2);
    });

    it("excludes out of stock items by default and includes them on request", async () => {
      const base = {
        filter: {
          type: "Field" as const,
          field: "categories",
          operator: CatalogFilterOperatorType.Contains as const,
          value: "Shoes",
        },
        sort: [{ field: "itemId" }],
      };
      const without = unwrap(
        await previewCatalogCollection({
          workspaceId: workspace.id,
          catalogName: "products",
          definition: base,
        }),
      );
      expect(without.items.map((item) => item.itemId)).toEqual([
        "shoe-1",
        "shoe-2",
      ]);

      const withSoldOut = unwrap(
        await previewCatalogCollection({
          workspaceId: workspace.id,
          catalogName: "products",
          definition: { ...base, includeOutOfStock: true },
        }),
      );
      expect(withSoldOut.items.map((item) => item.itemId)).toEqual([
        "shoe-1",
        "shoe-2",
        "shoe-3",
      ]);
    });

    it("excludes drafts by default", async () => {
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [
          {
            itemId: "draft-1",
            title: "Draft",
            status: CatalogItemStatus.Draft,
          },
        ],
      });
      const result = unwrap(
        await previewCatalogCollection({
          workspaceId: workspace.id,
          catalogName: "products",
          definition: {
            filter: {
              type: "Field",
              field: "itemId",
              operator: CatalogFilterOperatorType.Equals,
              value: "draft-1",
            },
          },
        }),
      );
      expect(result.items).toEqual([]);

      const included = unwrap(
        await previewCatalogCollection({
          workspaceId: workspace.id,
          catalogName: "products",
          definition: {
            filter: {
              type: "Field",
              field: "itemId",
              operator: CatalogFilterOperatorType.Equals,
              value: "draft-1",
            },
            includeUnpublished: true,
          },
        }),
      );
      expect(included.items.map((item) => item.itemId)).toEqual(["draft-1"]);
    });

    it("supports nested And/Or filters", async () => {
      const result = unwrap(
        await previewCatalogCollection({
          workspaceId: workspace.id,
          catalogName: "products",
          definition: {
            filter: {
              type: "And",
              children: [
                {
                  type: "Field",
                  field: "GENDER",
                  operator: CatalogFilterOperatorType.Equals,
                  value: "Women",
                },
                {
                  type: "Or",
                  children: [
                    {
                      type: "Field",
                      field: "price",
                      operator: CatalogFilterOperatorType.GreaterThanOrEqual,
                      value: 60,
                    },
                    {
                      type: "Field",
                      field: "itemId",
                      operator: CatalogFilterOperatorType.Equals,
                      value: "shoe-1",
                    },
                  ],
                },
              ],
            },
            sort: [{ field: "itemId" }],
          },
        }),
      );
      // shoe-1 matches through the itemId branch of the Or, despite its price.
      expect(result.items.map((item) => item.itemId)).toEqual([
        "bag-1",
        "shoe-1",
        "shoe-2",
      ]);
    });

    it("filters with In, NotEquals and Contains", async () => {
      const result = unwrap(
        await previewCatalogCollection({
          workspaceId: workspace.id,
          catalogName: "products",
          definition: {
            filter: {
              type: "And",
              children: [
                {
                  type: "Field",
                  field: "categories",
                  operator: CatalogFilterOperatorType.In,
                  value: ["Shoes", "Bags"],
                },
                {
                  type: "Field",
                  field: "tags",
                  operator: CatalogFilterOperatorType.Contains,
                  value: "bestseller",
                },
                {
                  type: "Field",
                  field: "itemId",
                  operator: CatalogFilterOperatorType.NotEquals,
                  value: "shoe-3",
                },
              ],
            },
            sort: [{ field: "itemId" }],
          },
        }),
      );
      expect(result.items.map((item) => item.itemId)).toEqual([
        "bag-1",
        "shoe-1",
      ]);
    });

    it("filters on inStock directly", async () => {
      const result = unwrap(
        await previewCatalogCollection({
          workspaceId: workspace.id,
          catalogName: "products",
          definition: {
            filter: {
              type: "Field",
              field: "inStock",
              operator: CatalogFilterOperatorType.Equals,
              value: false,
            },
            includeOutOfStock: true,
            sort: [{ field: "itemId" }],
          },
        }),
      );
      expect(result.items.map((item) => item.itemId)).toEqual(["shoe-3"]);
    });

    it("reports data freshness in the preview", async () => {
      const result = unwrap(
        await previewCatalogCollection({
          workspaceId: workspace.id,
          catalogName: "products",
          definition: {},
        }),
      );
      expect(result.dataFreshness?.syncStatus).toBe("ok");
      expect(result.dataFreshness?.lastSyncedAt).toBeGreaterThan(0);
    });

    it("rejects a comparison operator on a list field", async () => {
      const result = await upsertCatalogCollection({
        workspaceId: workspace.id,
        name: "Broken",
        catalogName: "products",
        definition: {
          filter: {
            type: "Field",
            field: "categories",
            operator: CatalogFilterOperatorType.GreaterThan,
            value: 1,
          },
        },
      });
      expect(result.isErr()).toBe(true);
    });

    it("persists, lists, renders and deletes collections", async () => {
      const saved = unwrap(
        await upsertCatalogCollection({
          workspaceId: workspace.id,
          name: "BestSellers",
          catalogName: "products",
          definition: {
            filter: {
              type: "Field",
              field: "tags",
              operator: CatalogFilterOperatorType.Contains,
              value: "bestseller",
            },
            limit: 5,
          },
        }),
      );
      expect(saved.catalogName).toBe("products");

      const collections = await listCatalogCollections({
        workspaceId: workspace.id,
      });
      expect(collections.map((collection) => collection.name)).toEqual([
        "BestSellers",
      ]);

      const resolved = await loadCatalogsForTemplates({
        workspaceId: workspace.id,
        templates: {
          body: `{% catalog_collection "BestSellers" as items %}{% endcatalog_collection %}`,
        },
      });
      // shoe-3 is a bestseller but out of stock, so it is not rendered.
      expect(resolved.BestSellers?.map((item) => item.itemId)).toEqual([
        "bag-1",
        "shoe-1",
      ]);
      // Typed fields are flattened onto the item so templates can address them.
      expect(resolved.BestSellers?.[0]).toMatchObject({
        itemId: "bag-1",
        title: "Tote",
        price: 60,
      });

      unwrap(
        await deleteCatalogCollection({
          workspaceId: workspace.id,
          name: "BestSellers",
        }),
      );
      expect(
        await listCatalogCollections({ workspaceId: workspace.id }),
      ).toEqual([]);
    });

    it("projects the requested item properties but keeps identity", async () => {
      unwrap(
        await upsertCatalogCollection({
          workspaceId: workspace.id,
          name: "Lite",
          catalogName: "products",
          definition: {
            filter: {
              type: "Field",
              field: "itemId",
              operator: CatalogFilterOperatorType.Equals,
              value: "shoe-1",
            },
            itemProperties: ["title", "price"],
          },
        }),
      );
      const resolved = await loadCatalogsForTemplates({
        workspaceId: workspace.id,
        templates: {
          body: `{% catalog_collection "Lite" as i %}{% endcatalog_collection %}`,
        },
      });
      expect(resolved.Lite).toEqual([
        {
          itemId: "shoe-1",
          itemType: CatalogItemType.Product,
          title: "Court Pump",
          price: 20,
        },
      ]);
    });

    it("returns an empty list for collections that do not exist", async () => {
      const resolved = await resolveCatalogCollections({
        workspaceId: workspace.id,
        names: ["DoesNotExist"],
      });
      expect(resolved).toEqual({ DoesNotExist: [] });
    });
  });

  describe("deleteCatalog", () => {
    it("removes the catalog and its collections", async () => {
      unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "products" }),
      );
      await upsertCatalogCollection({
        workspaceId: workspace.id,
        name: "All",
        catalogName: "products",
        definition: {},
      });
      unwrap(
        await deleteCatalog({ workspaceId: workspace.id, name: "products" }),
      );
      expect(await listCatalogs({ workspaceId: workspace.id })).toEqual([]);
      expect(
        await listCatalogCollections({ workspaceId: workspace.id }),
      ).toEqual([]);
    });

    it("fails for a catalog that does not exist", async () => {
      const result = await deleteCatalog({
        workspaceId: workspace.id,
        name: "missing",
      });
      expect(result.isErr()).toBe(true);
    });
  });
});
