import {
  CatalogFeedFormat,
  CatalogInventoryPolicy,
  CatalogItemType,
} from "isomorphic-lib/src/catalog";

import { feedRecordToItem, parseCatalogFeed, sniffFormat } from "./catalogFeed";

/**
 * The feed mapping is where a commerce catalog either works or quietly loses
 * data, so these tests pin down the two formats the platforms actually publish.
 */
describe("catalogFeed", () => {
  describe("sniffFormat", () => {
    it("recognises JSON by its opening bracket", () => {
      expect(sniffFormat('  [{"itemId":"1"}]')).toEqual(CatalogFeedFormat.Json);
      expect(sniffFormat('{"items":[]}')).toEqual(CatalogFeedFormat.Json);
    });

    it("treats everything else as XML", () => {
      expect(sniffFormat('<?xml version="1.0"?><rss></rss>')).toEqual(
        CatalogFeedFormat.Xml,
      );
      expect(sniffFormat("\n  <feed></feed>")).toEqual(CatalogFeedFormat.Xml);
    });
  });

  describe("parseCatalogFeed: JSON", () => {
    it("reads a bare array of items", () => {
      const result = parseCatalogFeed({
        body: JSON.stringify([
          {
            itemId: "SKU-1",
            title: "Court Pump",
            price: 49.95,
            inventoryQuantity: 4,
          },
        ]),
      });
      expect(result.format).toEqual(CatalogFeedFormat.Json);
      expect(result.skipped).toEqual([]);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          itemId: "SKU-1",
          title: "Court Pump",
          price: 49.95,
          inventoryQuantity: 4,
        }),
      );
    });

    it("reads an items envelope and snake_case aliases", () => {
      const result = parseCatalogFeed({
        body: JSON.stringify({
          items: [
            {
              item_id: "SKU-2",
              item_group_id: "SKU-1",
              image_url: "https://cdn/2.jpg",
              inventory_quantity: 0,
              inventory_policy: "deny",
            },
          ],
        }),
      });
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          itemId: "SKU-2",
          parentItemId: "SKU-1",
          itemType: CatalogItemType.Variant,
          imageUrl: "https://cdn/2.jpg",
          inventoryQuantity: 0,
          inventoryPolicy: CatalogInventoryPolicy.Deny,
        }),
      );
    });

    it("treats sale_price as the price and price as the compare-at price", () => {
      const item = feedRecordToItem({
        itemId: "SKU-3",
        price: "79.95 EUR",
        sale_price: "49.95 EUR",
      });
      expect(item).toEqual(
        expect.objectContaining({
          price: 49.95,
          compareAtPrice: 79.95,
          currency: "EUR",
        }),
      );
    });

    it("skips records without an id instead of failing the whole feed", () => {
      const result = parseCatalogFeed({
        body: JSON.stringify([{ title: "No id" }, { itemId: "SKU-4" }]),
      });
      expect(result.items.map((entry) => entry.itemId)).toEqual(["SKU-4"]);
      expect(result.skipped).toHaveLength(1);
    });

    it("reports non-object entries", () => {
      const result = parseCatalogFeed({ body: JSON.stringify(["nope"]) });
      expect(result.items).toEqual([]);
      expect(result.skipped[0]?.reason).toMatch(/not objects/);
    });

    it("throws on malformed JSON rather than returning an empty catalog", () => {
      expect(() => parseCatalogFeed({ body: "{oops" })).toThrow(
        /not valid json/,
      );
    });
  });

  describe("parseCatalogFeed: XML", () => {
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Shop</title>
    <item>
      <g:id>JF-1001</g:id>
      <title>Court Pump</title>
      <description>Leather pump</description>
      <link>https://shop/jf-1001</link>
      <g:image_link>https://cdn/jf-1001.jpg</g:image_link>
      <g:brand>JustFab</g:brand>
      <g:price>49.95 EUR</g:price>
      <g:availability>in stock</g:availability>
      <g:quantity>4</g:quantity>
      <g:product_type>Women &gt; Shoes &gt; Heels</g:product_type>
      <g:custom_label_0>bestseller</g:custom_label_0>
      <g:size>38</g:size>
    </item>
    <item>
      <g:id>JF-1002</g:id>
      <g:item_group_id>JF-1001</g:item_group_id>
      <title>Court Pump 39</title>
      <g:price>49.95 EUR</g:price>
      <g:availability>out of stock</g:availability>
    </item>
  </channel>
</rss>`;

    it("strips the g: namespace and maps Google Shopping fields", () => {
      const result = parseCatalogFeed({ body: rss });
      expect(result.format).toEqual(CatalogFeedFormat.Xml);
      expect(result.items).toHaveLength(2);

      expect(result.items[0]).toEqual(
        expect.objectContaining({
          itemId: "JF-1001",
          itemType: CatalogItemType.Product,
          title: "Court Pump",
          url: "https://shop/jf-1001",
          imageUrl: "https://cdn/jf-1001.jpg",
          brand: "JustFab",
          price: 49.95,
          currency: "EUR",
          inventoryQuantity: 4,
          categories: ["Women", "Shoes", "Heels"],
          tags: ["bestseller"],
          attributes: { size: "38" },
        }),
      );
    });

    it("derives a variant from item_group_id", () => {
      const result = parseCatalogFeed({ body: rss });
      expect(result.items[1]).toEqual(
        expect.objectContaining({
          itemId: "JF-1002",
          itemType: CatalogItemType.Variant,
          parentItemId: "JF-1001",
        }),
      );
    });

    it("treats out of stock as zero inventory that cannot be bought", () => {
      const result = parseCatalogFeed({ body: rss });
      expect(result.items[1]?.inventoryQuantity).toEqual(0);
      expect(result.items[1]?.inventoryPolicy).toEqual(
        CatalogInventoryPolicy.Deny,
      );
    });

    it("keeps a single item feed as an array", () => {
      const single = `<rss><channel><item><g:id>ONLY</g:id></item></channel></rss>`;
      const result = parseCatalogFeed({ body: single });
      expect(result.items.map((entry) => entry.itemId)).toEqual(["ONLY"]);
    });

    it("reads an Atom feed and its href links", () => {
      const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>atom-1</id>
    <title>Beach Tote</title>
    <link href="https://shop/atom-1"/>
    <summary>Canvas tote</summary>
  </entry>
</feed>`;
      const result = parseCatalogFeed({ body: atom });
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          itemId: "atom-1",
          title: "Beach Tote",
          url: "https://shop/atom-1",
        }),
      );
    });

    it("throws on malformed XML", () => {
      expect(() => parseCatalogFeed({ body: "<rss><channel>" })).toThrow();
    });
  });

  describe("inventory mapping", () => {
    it("treats backorder as buyable with a continue policy", () => {
      const item = feedRecordToItem({
        itemId: "SKU-5",
        availability: "backorder",
        quantity: 0,
      });
      expect(item?.inventoryPolicy).toEqual(CatalogInventoryPolicy.Continue);
      expect(item?.inventoryQuantity).toEqual(0);
    });

    it("trusts an explicit zero count over an in stock label", () => {
      const item = feedRecordToItem({
        itemId: "SKU-6",
        availability: "in_stock",
        quantity: 0,
      });
      expect(item?.inventoryQuantity).toEqual(0);
      expect(item?.inventoryPolicy).toBeUndefined();
    });

    it("leaves quantity unset when the feed only says in stock", () => {
      const item = feedRecordToItem({
        itemId: "SKU-7",
        availability: "in_stock",
      });
      expect(item?.inventoryQuantity).toBeUndefined();
    });
  });

  describe("status mapping", () => {
    it("maps draft and archived", () => {
      expect(
        feedRecordToItem({ itemId: "a", status: "draft" })?.status,
      ).toEqual("draft");
      expect(
        feedRecordToItem({ itemId: "b", status: "deleted" })?.status,
      ).toEqual("archived");
    });
  });
});
