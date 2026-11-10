import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import {
  deleteCatalog,
  deleteCatalogCollection,
  deleteCatalogItems,
  extractCatalogCollectionNames,
  listCatalogCollections,
  listCatalogItems,
  listCatalogs,
  loadCatalogsForTemplates,
  previewCatalogCollection,
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
  });

  describe("upsertCatalogItems", () => {
    it("creates items and reports the item count", async () => {
      const catalog = await upsertCatalog({
        workspaceId: workspace.id,
        name: "products",
      });
      expect(catalog.itemCount).toBe(0);

      const result = unwrap(
        await upsertCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          items: [
            { itemId: "sku-1", attributes: { title: "Shoe", price: 20 } },
            { itemId: "sku-2", attributes: { title: "Bag", price: 50 } },
          ],
        }),
      );
      expect(result).toEqual({
        upsertedCount: 2,
        deletedCount: 0,
        itemCount: 2,
      });

      const catalogs = await listCatalogs({ workspaceId: workspace.id });
      expect(catalogs).toHaveLength(1);
      expect(catalogs[0]?.itemCount).toBe(2);
    });

    it("updates existing items in place", async () => {
      await upsertCatalog({ workspaceId: workspace.id, name: "products" });
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [{ itemId: "sku-1", attributes: { title: "Shoe" } }],
      });
      const result = unwrap(
        await upsertCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          items: [{ itemId: "sku-1", attributes: { title: "Boot" } }],
        }),
      );
      expect(result.itemCount).toBe(1);

      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
        }),
      );
      expect(items.items).toHaveLength(1);
      expect(items.items[0]?.attributes).toEqual({ title: "Boot" });
    });

    it("deletes items missing from the request when replace is set", async () => {
      await upsertCatalog({ workspaceId: workspace.id, name: "products" });
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [
          { itemId: "sku-1", attributes: { title: "Shoe" } },
          { itemId: "sku-2", attributes: { title: "Bag" } },
        ],
      });
      const result = unwrap(
        await upsertCatalogItems({
          workspaceId: workspace.id,
          catalogName: "products",
          items: [{ itemId: "sku-1", attributes: { title: "Shoe" } }],
          replace: true,
        }),
      );
      expect(result.deletedCount).toBe(1);
      expect(result.itemCount).toBe(1);
    });

    it("fails when the catalog does not exist", async () => {
      const result = await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "missing",
        items: [{ itemId: "sku-1", attributes: {} }],
      });
      expect(result.isErr()).toBe(true);
    });

    it("deletes the requested items", async () => {
      await upsertCatalog({ workspaceId: workspace.id, name: "products" });
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: [
          { itemId: "sku-1", attributes: {} },
          { itemId: "sku-2", attributes: {} },
        ],
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

  describe("listCatalogItems", () => {
    it("paginates with a cursor", async () => {
      await upsertCatalog({ workspaceId: workspace.id, name: "products" });
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "products",
        items: ["a", "b", "c"].map((itemId) => ({ itemId, attributes: {} })),
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

  describe("collections", () => {
    const products = [
      {
        itemId: "shoe-1",
        attributes: {
          CATEGORY: "Shoes",
          GENDER: "Women",
          price: 20,
          tags: ["bestseller", "sale"],
        },
      },
      {
        itemId: "shoe-2",
        attributes: {
          CATEGORY: "Shoes",
          GENDER: "Women",
          price: 80,
          tags: ["new"],
        },
      },
      {
        itemId: "bag-1",
        attributes: {
          CATEGORY: "Bags",
          GENDER: "Women",
          price: 60,
          tags: ["bestseller"],
        },
      },
    ];

    beforeEach(async () => {
      await upsertCatalog({ workspaceId: workspace.id, name: "products" });
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
              field: "CATEGORY",
              operator: "Equals",
              value: "Shoes",
            },
            sort: [{ field: "price", direction: "desc" }],
            limit: 1,
          },
        }),
      );
      expect(result.itemCount).toBe(1);
      expect(result.items[0]?.itemId).toBe("shoe-2");
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
                  operator: "Equals",
                  value: "Women",
                },
                {
                  type: "Or",
                  children: [
                    {
                      type: "Field",
                      field: "price",
                      operator: "GreaterThanOrEqual",
                      value: 60,
                    },
                    {
                      type: "Field",
                      field: "itemId",
                      operator: "Equals",
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
                  field: "CATEGORY",
                  operator: "In",
                  value: ["Shoes", "Bags"],
                },
                {
                  type: "Field",
                  field: "tags",
                  operator: "Contains",
                  value: "bestseller",
                },
                {
                  type: "Field",
                  field: "itemId",
                  operator: "NotEquals",
                  value: "shoe-2",
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

    it("projects item properties", async () => {
      const result = unwrap(
        await previewCatalogCollection({
          workspaceId: workspace.id,
          catalogName: "products",
          definition: {
            filter: {
              type: "Field",
              field: "itemId",
              operator: "Equals",
              value: "shoe-1",
            },
            itemProperties: ["CATEGORY", "price"],
          },
        }),
      );
      expect(result.items[0]).toEqual({
        itemId: "shoe-1",
        attributes: {
          CATEGORY: "Shoes",
          price: 20,
        },
      });
    });

    it("persists, lists and deletes collections", async () => {
      const saved = unwrap(
        await upsertCatalogCollection({
          workspaceId: workspace.id,
          name: "BestSellers",
          catalogName: "products",
          definition: {
            filter: {
              type: "Field",
              field: "tags",
              operator: "Contains",
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
      expect(resolved.BestSellers?.map((item) => item.itemId)).toEqual([
        "bag-1",
        "shoe-1",
      ]);

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
      await upsertCatalog({ workspaceId: workspace.id, name: "products" });
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
