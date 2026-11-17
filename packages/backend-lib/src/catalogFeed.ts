import axios from "axios";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  CatalogFeedFormat,
  CatalogInventoryPolicy,
  CatalogItemInput,
  CatalogItemStatus,
  CatalogItemType,
} from "isomorphic-lib/src/catalog";

/**
 * Reading a commerce feed into catalog items.
 *
 * Two formats are supported, because those are the two the platforms actually
 * publish:
 *
 * - JSON: either a bare array, or an object with an `items` (or `products`)
 *   array. Each element is already shaped like a catalog item, so it maps
 *   almost directly.
 * - XML: Google Shopping RSS, Atom, or anything using the same element names.
 *   `g:` prefixes are stripped, so `g:id` and `id` are the same field.
 *
 * Parsing is deliberately forgiving: a single bad record is reported as
 * skipped instead of failing the sync, because one malformed product should not
 * keep a 90k item catalog stale. A feed that yields no parsable items at all is
 * an error, since archiving a whole catalog on the strength of a broken feed
 * would be worse than leaving yesterday's data in place.
 */

/** Klaviyo caps custom feeds at 100MB; we stop reading past that. */
export const MAX_FEED_BYTES = 100 * 1024 * 1024;

/** Sanity cap so a pathological feed cannot exhaust worker memory. */
export const MAX_FEED_ITEMS = 250_000;

export const FEED_FETCH_TIMEOUT_MS = 60 * 1000;

export interface FeedParseResult {
  items: CatalogItemInput[];
  /** Records the feed carried that we could not turn into an item. */
  skipped: { index: number; reason: string }[];
  /** Format actually used, after sniffing when the caller did not pin one. */
  format: CatalogFeedFormat;
}

export interface FeedFetchError {
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * XML elements arrive as either a string, a number (when `parseTagValue` is on,
 * which we keep off), or an object with `#text` when the element carries
 * attributes. This flattens all of those to a trimmed string.
 */
function textOf(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = textOf(entry);
      if (text !== undefined) {
        return text;
      }
    }
    return undefined;
  }
  if (isRecord(value)) {
    // Atom and RSS put the target in attributes rather than text:
    // `<link href="https://..."/>`. Prefer the element text, then the href.
    return textOf(value["#text"]) ?? textOf(value.href) ?? textOf(value.url);
  }
  return undefined;
}

function numberFrom(value: unknown): number | undefined {
  const text = textOf(value);
  if (text === undefined) {
    return undefined;
  }
  // Feeds write money as "149.95 EUR", "149,95", or "€149.95".
  const match = text.replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/);
  if (!match) {
    return undefined;
  }
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** "149.95 EUR" carries both a number and the currency it is denominated in. */
function moneyFrom(value: unknown): {
  amount?: number;
  currency?: string;
} {
  const text = textOf(value);
  if (text === undefined) {
    return {};
  }
  const currency = text.match(/\b([A-Z]{3})\b/)?.[1];
  return { amount: numberFrom(text), currency };
}

function stringsFrom(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const out = value
      .map((entry) => textOf(entry))
      .filter((entry): entry is string => Boolean(entry));
    return out.length ? out : undefined;
  }
  const single = textOf(value);
  if (single === undefined) {
    return undefined;
  }
  return single
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function itemTypeFrom({
  parentItemId,
  explicit,
}: {
  parentItemId?: string;
  explicit?: unknown;
}): CatalogItemType {
  if (parentItemId) {
    return CatalogItemType.Variant;
  }
  const text = textOf(explicit)?.toLowerCase();
  if (text === "variant") {
    return CatalogItemType.Variant;
  }
  return CatalogItemType.Product;
}

function statusFrom(value: unknown): CatalogItemStatus | undefined {
  const text = textOf(value)?.toLowerCase();
  if (!text) {
    return undefined;
  }
  if (text === "draft") {
    return CatalogItemStatus.Draft;
  }
  if (text === "archived" || text === "deleted") {
    return CatalogItemStatus.Archived;
  }
  if (text === "published" || text === "active") {
    return CatalogItemStatus.Published;
  }
  return undefined;
}

/**
 * Google Shopping says whether something is buyable in `availability`, and only
 * sometimes repeats the count in `quantity`. Both have to land on the same
 * `inventoryQuantity` / `inventoryPolicy` pair, otherwise a feed that says
 * `out_of_stock` with a stale `quantity: 12` would keep the item buyable.
 */
/**
 * Older feeds spell the policy `backorder` while the catalog model calls it
 * `continue`; anything unrecognised falls back to the availability label.
 */
function policyFrom(
  value: string | undefined,
): CatalogInventoryPolicy | undefined {
  if (value === CatalogInventoryPolicy.Continue || value === "backorder") {
    return CatalogInventoryPolicy.Continue;
  }
  if (value === CatalogInventoryPolicy.Deny) {
    return CatalogInventoryPolicy.Deny;
  }
  return undefined;
}

function inventoryFrom(record: Record<string, unknown>): {
  inventoryQuantity?: number;
  inventoryPolicy?: CatalogInventoryPolicy;
} {
  const availability =
    textOf(record.availability) ??
    textOf(record.stock_status) ??
    textOf(record.inventory_status);
  const normalized = availability?.toLowerCase().replace(/[\s-]/g, "_");
  const policy = policyFrom(
    textOf(record.inventory_policy) ?? textOf(record.inventoryPolicy),
  );
  const quantity =
    numberFrom(record.quantity) ??
    numberFrom(record.inventory_quantity) ??
    numberFrom(record.inventoryQuantity) ??
    numberFrom(record.stock);

  if (normalized === "out_of_stock" || normalized === "oos") {
    return {
      inventoryQuantity: 0,
      inventoryPolicy: CatalogInventoryPolicy.Deny,
    };
  }
  if (
    normalized === "backorder" ||
    normalized === "preorder" ||
    normalized === "available_for_order"
  ) {
    return {
      inventoryQuantity: quantity,
      inventoryPolicy: CatalogInventoryPolicy.Continue,
    };
  }
  if (normalized === "in_stock" || normalized === "available") {
    // A count of 0 contradicts "in stock"; trust the explicit count.
    return { inventoryQuantity: quantity, inventoryPolicy: policy };
  }
  return { inventoryQuantity: quantity, inventoryPolicy: policy };
}

/** Categories are hierarchical; collections want the leaves as well as the path. */
function categoriesFrom(record: Record<string, unknown>): string[] | undefined {
  const productType = textOf(record.product_type);
  const direct = stringsFrom(record.categories);
  const fromPath = productType
    ? productType
        .split(">")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];
  const all = [...(direct ?? []), ...fromPath];
  const unique = [...new Set(all)].slice(0, 100);
  return unique.length ? unique : undefined;
}

/** Fields Google Shopping uses that collections may want to filter on. */
const EXTRA_ATTRIBUTE_FIELDS = [
  "size",
  "color",
  "gender",
  "age_group",
  "material",
  "pattern",
  "condition",
  "mpn",
  "gtin",
];

function attributesFrom(
  record: Record<string, unknown>,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const field of EXTRA_ATTRIBUTE_FIELDS) {
    const text = textOf(record[field]);
    if (text !== undefined) {
      out[field] = text;
    }
  }
  const nested = record.attributes;
  if (isRecord(nested)) {
    for (const [key, value] of Object.entries(nested)) {
      const text = textOf(value);
      if (text !== undefined) {
        out[key] = text;
      }
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * `sale_price` is the price the customer pays, `price` is the list price. When
 * both are present the list price becomes `compareAtPrice`, which is what a
 * "was €X now €Y" block needs.
 */
function priceFields(record: Record<string, unknown>): {
  price?: number;
  compareAtPrice?: number;
  currency?: string;
} {
  const list = moneyFrom(record.price ?? record.list_price);
  const sale = moneyFrom(record.sale_price);
  const currency =
    list.currency ??
    sale.currency ??
    textOf(record.currency_code) ??
    textOf(record.currency);
  if (sale.amount !== undefined) {
    return { price: sale.amount, compareAtPrice: list.amount, currency };
  }
  return { price: list.amount, currency };
}

function imageUrlFrom(record: Record<string, unknown>): string | undefined {
  return (
    textOf(record.image_link) ??
    textOf(record.image_url) ??
    textOf(record.image) ??
    textOf(record.featured_image)
  );
}

function urlFrom(record: Record<string, unknown>): string | undefined {
  return (
    textOf(record.link) ?? textOf(record.url) ?? textOf(record.product_url)
  );
}

function itemIdFrom(record: Record<string, unknown>): string | undefined {
  return (
    textOf(record.id) ??
    textOf(record.item_id) ??
    textOf(record.itemId) ??
    textOf(record.sku)
  );
}

function parentItemIdFrom(record: Record<string, unknown>): string | undefined {
  return (
    textOf(record.item_group_id) ??
    textOf(record.parent_item_id) ??
    textOf(record.parentItemId)
  );
}

function tagsFrom(record: Record<string, unknown>): string[] | undefined {
  const direct = stringsFrom(record.tags);
  const labels = [0, 1, 2, 3, 4]
    .map((index) => textOf(record[`custom_label_${index}`]))
    .filter((entry): entry is string => Boolean(entry));
  const all = [...(direct ?? []), ...labels];
  const unique = [...new Set(all)].slice(0, 100);
  return unique.length ? unique : undefined;
}

/**
 * Maps one feed record to a catalog item. Returns `undefined` when the record
 * has no usable id, which is the only field a catalog cannot invent.
 */
export function feedRecordToItem(
  record: Record<string, unknown>,
): CatalogItemInput | undefined {
  const itemId = itemIdFrom(record);
  if (!itemId) {
    return undefined;
  }
  const parentItemId = parentItemIdFrom(record);
  const prices = priceFields(record);
  const inventory = inventoryFrom(record);
  return {
    itemId: itemId.slice(0, 255),
    itemType: itemTypeFrom({ parentItemId, explicit: record.item_type }),
    parentItemId: parentItemId?.slice(0, 255),
    title: textOf(record.title)?.slice(0, 1024),
    description: textOf(record.description)?.slice(0, 20000),
    url: urlFrom(record)?.slice(0, 2048),
    imageUrl: imageUrlFrom(record)?.slice(0, 2048),
    brand: textOf(record.brand)?.slice(0, 255),
    price: prices.price,
    compareAtPrice: prices.compareAtPrice,
    currency: prices.currency?.slice(0, 3),
    inventoryQuantity: inventory.inventoryQuantity,
    inventoryPolicy: inventory.inventoryPolicy,
    status: statusFrom(record.status),
    categories: categoriesFrom(record),
    tags: tagsFrom(record),
    attributes: attributesFrom(record),
  };
}

function collectRecords({
  parsed,
  format,
}: {
  parsed: unknown;
  format: CatalogFeedFormat;
}): { records: Record<string, unknown>[]; malformed: number } {
  let container: unknown;
  if (format === CatalogFeedFormat.Json) {
    if (Array.isArray(parsed)) {
      container = parsed;
    } else if (isRecord(parsed)) {
      container = parsed.items ?? parsed.products ?? parsed.data;
    }
  } else if (isRecord(parsed)) {
    const { rss } = parsed;
    const channel = isRecord(rss) ? rss.channel : undefined;
    const { feed } = parsed;
    container =
      (isRecord(channel) ? channel.item : undefined) ??
      (isRecord(feed) ? feed.entry : undefined) ??
      (isRecord(parsed.items) ? parsed.items.item : undefined) ??
      parsed.item;
  }

  if (!Array.isArray(container)) {
    return { records: [], malformed: 0 };
  }
  const records: Record<string, unknown>[] = [];
  let malformed = 0;
  for (const entry of container) {
    if (isRecord(entry)) {
      records.push(entry);
    } else {
      malformed += 1;
    }
  }
  return { records, malformed };
}

const XML_PARSER = new XMLParser({
  // Atom carries the product URL in `<link href>` rather than element text, so
  // attributes have to be read; the prefix is cleared so `item.href` works.
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // A one item feed must still come back as an array.
  isArray: (name) => ["item", "entry"].includes(name),
});

export function sniffFormat(body: string): CatalogFeedFormat {
  const head = body.trimStart().slice(0, 1);
  if (head === "{" || head === "[") {
    return CatalogFeedFormat.Json;
  }
  return CatalogFeedFormat.Xml;
}

/**
 * Turns a feed body into items. Pure: no network, no database, so the mapping
 * rules can be tested without standing up a server.
 */
export function parseCatalogFeed({
  body,
  format = sniffFormat(body),
}: {
  body: string;
  format?: CatalogFeedFormat;
}): FeedParseResult {
  let parsed: unknown;
  try {
    if (format === CatalogFeedFormat.Json) {
      parsed = JSON.parse(body);
    } else {
      // A truncated feed is common when a CDN times out mid response. Parse
      // leniently and a half written document looks like a catalog with fewer
      // products, which is exactly the failure we must not paper over.
      const validation = XMLValidator.validate(body);
      if (validation !== true) {
        throw new Error(
          `Malformed XML: ${validation.err.msg} (line ${validation.err.line})`,
        );
      }
      parsed = XML_PARSER.parse(body);
    }
  } catch (error) {
    throw new Error(
      `Feed is not valid ${format}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const { records, malformed } = collectRecords({ parsed, format });
  const items: CatalogItemInput[] = [];
  const skipped: { index: number; reason: string }[] = [];
  records.forEach((record, index) => {
    const item = feedRecordToItem(record);
    if (!item) {
      skipped.push({ index, reason: "Record has no id" });
      return;
    }
    items.push(item);
  });
  if (malformed) {
    skipped.push({
      index: -1,
      reason: `${malformed} entries were not objects`,
    });
  }
  if (items.length > MAX_FEED_ITEMS) {
    throw new Error(
      `Feed carries ${items.length} items, more than the ${MAX_FEED_ITEMS} limit per sync.`,
    );
  }
  return { items, skipped, format };
}

/**
 * Pulls a feed over HTTP and parses it. Used both by the scheduler and by the
 * manual sync endpoint, so it stays a plain async function.
 */
export async function fetchCatalogFeed({
  url,
  format: pinnedFormat,
}: {
  url: string;
  format?: CatalogFeedFormat;
}): Promise<FeedParseResult> {
  const response = await axios.get<string>(url, {
    responseType: "text",
    timeout: FEED_FETCH_TIMEOUT_MS,
    maxContentLength: MAX_FEED_BYTES,
    maxBodyLength: MAX_FEED_BYTES,
    // Feeds are data, not HTML; do not let axios coerce them.
    transformResponse: [(data: string) => data],
    headers: { accept: "application/json, application/xml, text/xml, */*" },
  });
  const body =
    typeof response.data === "string" ? response.data : String(response.data);
  if (body.length > MAX_FEED_BYTES) {
    throw new Error(`Feed is larger than ${MAX_FEED_BYTES} bytes`);
  }
  const contentLength: unknown = response.headers["content-length"];
  if (
    typeof contentLength === "string" &&
    Number(contentLength) > MAX_FEED_BYTES
  ) {
    throw new Error(`Feed is larger than ${MAX_FEED_BYTES} bytes`);
  }
  return parseCatalogFeed({ body, format: pinnedFormat });
}
