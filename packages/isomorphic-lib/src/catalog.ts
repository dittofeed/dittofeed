import { Static, Type } from "@sinclair/typebox";

/**
 * Product catalogs.
 *
 * The model follows the shape commerce platforms expect, and mirrors the
 * vocabulary Klaviyo uses for catalogs:
 *
 * - A catalog holds products. A product has zero or more variants (one row per
 *   purchasable SKU). Both live in the same table and are distinguished by
 *   `itemType`, with variants pointing at their product via `parentItemId`.
 * - Price and inventory are first class columns, not free-form attributes,
 *   because they carry trigger semantics (price drops, back in stock) and need
 *   to be filtered and sorted without a jsonb scan.
 * - Items are never hard deleted on the strength of a single sync. A sync that
 *   does not mention an item marks it stale; items unseen past a grace period
 *   are removed. This keeps a partial or interrupted feed from wiping a catalog.
 *
 * Collections are named, saved queries over a single catalog: a filter tree, an
 * optional sort, and a limit. Templates read them through the
 * `catalog_collection` liquid tag:
 *
 *   {% catalog_collection "BestSellerShoes" as items %}
 *     {% for item in items %}{{ item.title }}{% endfor %}
 *   {% endcatalog_collection %}
 */

/** How the items in a catalog reach us. */
export enum CatalogSourceType {
  /** Pushed by the customer through the admin API. */
  Api = "api",
  /** Pulled from a JSON or XML feed URL on a schedule. */
  Feed = "feed",
}

export const CatalogSourceTypeSchema = Type.Enum(CatalogSourceType);

/** Wire format of a pulled feed. */
export enum CatalogFeedFormat {
  /** A JSON array, or an object with an `items` array. */
  Json = "json",
  /** Google Shopping RSS, Atom, or any XML with the same element names. */
  Xml = "xml",
}

export const CatalogFeedFormatSchema = Type.Enum(CatalogFeedFormat);

/** Whether a row is a parent product or one of its purchasable variants. */
export enum CatalogItemType {
  Product = "product",
  Variant = "variant",
}

/** Visibility. Archived items stay addressable but are excluded by default. */
export enum CatalogItemStatus {
  Published = "published",
  Draft = "draft",
  Archived = "archived",
}

export const CatalogItemStatusSchema = Type.Enum(CatalogItemStatus);

/**
 * What happens when someone buys an out-of-stock variant. `continue` allows
 * backorders, which also means the item keeps appearing in product blocks.
 */
export enum CatalogInventoryPolicy {
  Deny = "deny",
  Continue = "continue",
}

export const CatalogInventoryPolicySchema = Type.Enum(CatalogInventoryPolicy);

/** Health of the most recent sync, surfaced in the UI and the API. */
export enum CatalogSyncStatus {
  /** No sync has ever completed. */
  Never = "never",
  Ok = "ok",
  /** Completed, but some records were rejected. */
  Partial = "partial",
  Failed = "failed",
}

export const CatalogSyncStatusSchema = Type.Enum(CatalogSyncStatus);

/**
 * Price and inventory move far more often than product content, so they sync
 * on their own channels. A `price` sync only touches price columns and never
 * creates or deletes rows; same for `inventory`.
 */
export enum CatalogSyncKind {
  /** Full or delta sync of item content. The only kind that may delete. */
  Items = "items",
  /** Partial update of price columns only. */
  Price = "price",
  /** Partial update of inventory columns only. */
  Inventory = "inventory",
}

export const CatalogSyncKindSchema = Type.Enum(CatalogSyncKind);

/**
 * Item fields that address a typed column instead of a key in `attributes`.
 * Filtering and sorting on these uses an index; everything else goes through
 * the jsonb path and is evaluated per row.
 */
export const CatalogReservedItemField = Type.Union([
  Type.Literal("itemId"),
  Type.Literal("parentItemId"),
  Type.Literal("itemType"),
  Type.Literal("title"),
  Type.Literal("price"),
  Type.Literal("compareAtPrice"),
  Type.Literal("currency"),
  Type.Literal("inventoryQuantity"),
  Type.Literal("inStock"),
  Type.Literal("status"),
  Type.Literal("url"),
  Type.Literal("imageUrl"),
  Type.Literal("brand"),
  Type.Literal("categories"),
  Type.Literal("tags"),
]);

export type CatalogReservedItemField = Static<
  typeof CatalogReservedItemField
>;

/**
 * `NotEquals` / `NotIn` treat items that are missing the field as matching, so
 * a negation never silently drops items with incomplete attributes. `Contains`
 * checks arrays with `@>` and falls back to a case-insensitive substring match
 * for scalars. The comparison operators coerce the value to a number.
 */
export enum CatalogFilterOperatorType {
  Equals = "Equals",
  NotEquals = "NotEquals",
  In = "In",
  NotIn = "NotIn",
  Contains = "Contains",
  Exists = "Exists",
  GreaterThan = "GreaterThan",
  GreaterThanOrEqual = "GreaterThanOrEqual",
  LessThan = "LessThan",
  LessThanOrEqual = "LessThanOrEqual",
}

export const CatalogFilterOperator = Type.Enum(CatalogFilterOperatorType);

export type CatalogFilterOperator = Static<typeof CatalogFilterOperator>;

export const CatalogFilterScalar = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
]);

export type CatalogFilterScalar = Static<typeof CatalogFilterScalar>;

/**
 * Dotted path into an item, e.g. `price`, `tags`, or `size.UK`.
 *
 * A path that matches one of `CatalogReservedItemField` addresses a column;
 * anything else addresses `attributes`. The pattern is enforced at write time
 * because the path is interpolated into the jsonb path literal used by the
 * collection query.
 */
export const CatalogAttributePath = Type.String({
  minLength: 1,
  maxLength: 255,
  pattern: "^[A-Za-z0-9_-]+(\\.[A-Za-z0-9_-]+)*$",
});

export type CatalogAttributePath = Static<typeof CatalogAttributePath>;

export enum CatalogFilterType {
  Field = "Field",
  And = "And",
  Or = "Or",
}

export const CatalogFieldFilter = Type.Object({
  type: Type.Literal("Field"),
  field: CatalogAttributePath,
  operator: CatalogFilterOperator,
  // Omitted for the Exists operator. An array is required for In / NotIn, and a
  // number for the comparison operators.
  value: Type.Optional(
    Type.Union([CatalogFilterScalar, Type.Array(CatalogFilterScalar)]),
  ),
});

export type CatalogFieldFilter = Static<typeof CatalogFieldFilter>;

export const CatalogFilter = Type.Recursive(
  (This) =>
    Type.Union([
      CatalogFieldFilter,
      Type.Object({
        type: Type.Literal("And"),
        children: Type.Array(This),
      }),
      Type.Object({
        type: Type.Literal("Or"),
        children: Type.Array(This),
      }),
    ]),
  { $id: "CatalogFilter" },
);

export type CatalogFilter = Static<typeof CatalogFilter>;

export const CatalogSortDirection = Type.Union([
  Type.Literal("asc"),
  Type.Literal("desc"),
]);

export type CatalogSortDirection = Static<typeof CatalogSortDirection>;

export const CatalogSortField = Type.Object({
  field: CatalogAttributePath,
  direction: Type.Optional(CatalogSortDirection),
});

export type CatalogSortField = Static<typeof CatalogSortField>;

export const CatalogCollectionDefinition = Type.Object({
  filter: Type.Optional(CatalogFilter),
  sort: Type.Optional(Type.Array(CatalogSortField)),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  // When set, only these paths are returned for each item.
  itemProperties: Type.Optional(Type.Array(CatalogAttributePath)),
  /**
   * Whether the query may return items that are not published or are out of
   * stock. Defaults to false, matching how a product block behaves when it is
   * not explicitly configured to include them.
   */
  includeUnpublished: Type.Optional(Type.Boolean()),
  includeOutOfStock: Type.Optional(Type.Boolean()),
});

export type CatalogCollectionDefinition = Static<
  typeof CatalogCollectionDefinition
>;

/**
 * The attribute payload of a single catalog item, i.e. the fields that have no
 * typed column. Rendered templates read typed fields off the item resource and
 * everything else through these keys.
 */
export const CatalogItemAttributes = Type.Record(
  Type.String(),
  Type.Unknown(),
);

export type CatalogItemAttributes = Static<typeof CatalogItemAttributes>;

export const CatalogResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  sourceType: CatalogSourceTypeSchema,
  currency: Type.String(),
  locale: Type.Optional(Type.String()),
  itemCount: Type.Number(),
  variantCount: Type.Number(),
  syncStatus: CatalogSyncStatusSchema,
  /** Epoch millis of the last successful item sync, absent if never. */
  lastSyncedAt: Type.Optional(Type.Number()),
  lastPriceSyncedAt: Type.Optional(Type.Number()),
  lastInventorySyncedAt: Type.Optional(Type.Number()),
  /** Present when the catalog is pulled from a feed. */
  sourceUrl: Type.Optional(Type.String()),
  feedFormat: Type.Optional(CatalogFeedFormatSchema),
  syncIntervalMinutes: Type.Number(),
  syncEnabled: Type.Boolean(),
  /** Epoch millis of the next scheduled pull, absent for API catalogs. */
  nextSyncAt: Type.Optional(Type.Number()),
  consecutiveFailures: Type.Number(),
  createdAt: Type.Number(),
  updatedAt: Type.Number(),
});

export type CatalogResource = Static<typeof CatalogResource>;

export const ReadCatalogsRequest = Type.Object({
  workspaceId: Type.String(),
});

export type ReadCatalogsRequest = Static<typeof ReadCatalogsRequest>;

export const ReadCatalogsResponse = Type.Object({
  catalogs: Type.Array(CatalogResource),
});

export type ReadCatalogsResponse = Static<typeof ReadCatalogsResponse>;

export const UpsertCatalogResource = Type.Object({
  workspaceId: Type.String(),
  name: Type.String({ minLength: 1, maxLength: 255 }),
  sourceType: Type.Optional(CatalogSourceTypeSchema),
  /** ISO 4217 code used to format prices when no item overrides it. */
  currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
  locale: Type.Optional(Type.String({ minLength: 2, maxLength: 35 })),
  /**
   * Feed location. Setting it implies `sourceType: feed` unless the caller says
   * otherwise, and schedules the first pull immediately.
   */
  sourceUrl: Type.Optional(Type.String({ minLength: 1, maxLength: 2048 })),
  feedFormat: Type.Optional(CatalogFeedFormatSchema),
  /** How often to re-pull. Six hours matches the common feed refresh cadence. */
  syncIntervalMinutes: Type.Optional(
    Type.Integer({ minimum: 15, maximum: 10080 }),
  ),
  syncEnabled: Type.Optional(Type.Boolean()),
});

export type UpsertCatalogResource = Static<typeof UpsertCatalogResource>;

export const UpsertCatalogResponse = Type.Object({
  catalog: CatalogResource,
});

export type UpsertCatalogResponse = Static<typeof UpsertCatalogResponse>;

export const DeleteCatalogRequest = Type.Object({
  workspaceId: Type.String(),
  name: Type.String(),
});

export type DeleteCatalogRequest = Static<typeof DeleteCatalogRequest>;

/**
 * A single item on the wire. `itemId` is the external id, i.e. what the
 * commerce platform calls the product or variant id. It is the only required
 * field beyond type information, so a price-only or inventory-only update can
 * send just the fields it owns.
 */
export const CatalogItemInput = Type.Object({
  itemId: Type.String({ minLength: 1, maxLength: 255 }),
  itemType: Type.Optional(Type.Enum(CatalogItemType)),
  /** Set on variants to point at the parent product's `itemId`. */
  parentItemId: Type.Optional(Type.String({ maxLength: 255 })),
  title: Type.Optional(Type.String({ maxLength: 1024 })),
  description: Type.Optional(Type.String({ maxLength: 20000 })),
  url: Type.Optional(Type.String({ maxLength: 2048 })),
  imageUrl: Type.Optional(Type.String({ maxLength: 2048 })),
  brand: Type.Optional(Type.String({ maxLength: 255 })),
  price: Type.Optional(Type.Number({ minimum: 0 })),
  compareAtPrice: Type.Optional(Type.Number({ minimum: 0 })),
  currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
  inventoryQuantity: Type.Optional(Type.Number()),
  inventoryPolicy: Type.Optional(CatalogInventoryPolicySchema),
  status: Type.Optional(CatalogItemStatusSchema),
  categories: Type.Optional(
    Type.Array(Type.String({ maxLength: 255 }), { maxItems: 100 }),
  ),
  tags: Type.Optional(
    Type.Array(Type.String({ maxLength: 255 }), { maxItems: 100 }),
  ),
  attributes: Type.Optional(CatalogItemAttributes),
});

export type CatalogItemInput = Static<typeof CatalogItemInput>;

export const CatalogItemResource = Type.Object({
  itemId: Type.String(),
  itemType: Type.Enum(CatalogItemType),
  parentItemId: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
  imageUrl: Type.Optional(Type.String()),
  brand: Type.Optional(Type.String()),
  price: Type.Optional(Type.Number()),
  compareAtPrice: Type.Optional(Type.Number()),
  currency: Type.Optional(Type.String()),
  /** Lowest and highest variant price. Only set on products. */
  priceMin: Type.Optional(Type.Number()),
  priceMax: Type.Optional(Type.Number()),
  inventoryQuantity: Type.Optional(Type.Number()),
  inventoryPolicy: Type.Optional(CatalogInventoryPolicySchema),
  /**
   * Aggregates rolled up from the variants. Only set on products, and only
   * once they have variants: they answer "can this product be bought, and from
   * what price" without the caller having to fetch every variant.
   */
  inventoryTotal: Type.Optional(Type.Number()),
  variantCount: Type.Optional(Type.Number()),
  /** True when a variant is buyable, i.e. in stock or backorderable. */
  inStock: Type.Boolean(),
  status: CatalogItemStatusSchema,
  categories: Type.Array(Type.String()),
  tags: Type.Array(Type.String()),
  attributes: CatalogItemAttributes,
  createdAt: Type.Optional(Type.Number()),
  updatedAt: Type.Optional(Type.Number()),
});

export type CatalogItemResource = Static<typeof CatalogItemResource>;

export const UpsertCatalogItemsRequest = Type.Object({
  workspaceId: Type.String(),
  catalogName: Type.String(),
  /**
   * Which channel this write belongs to. `items` (the default) writes item
   * content and may delete. `price` and `inventory` only touch their own
   * columns, never create rows, and never delete — matching how a high
   * frequency price or inventory feed is expected to behave.
   */
  kind: Type.Optional(CatalogSyncKindSchema),
  items: Type.Array(CatalogItemInput, { minItems: 1, maxItems: 5000 }),
  // When true, items in the catalog that are not present in this request are
  // deleted. The request is applied in a single transaction, so it is only
  // suitable for catalogs that fit in one request (<= 5000 items). For larger
  // catalogs use `syncId` plus `CompleteCatalogSyncRequest` instead.
  replace: Type.Optional(Type.Boolean()),
  // Marks the items written by this request as belonging to a sync generation.
  // Once every chunk has been written, call `POST /catalogs/items/complete`
  // with the same `syncId` to delete items left over from previous syncs.
  // Only meaningful for `kind: "items"`.
  syncId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
});

export type UpsertCatalogItemsRequest = Static<
  typeof UpsertCatalogItemsRequest
>;

export const UpsertCatalogItemsResponse = Type.Object({
  upsertedCount: Type.Number(),
  deletedCount: Type.Number(),
  itemCount: Type.Number(),
  /**
   * Items present in the request that were skipped, e.g. a `price` sync that
   * names an item the catalog does not know about yet.
   */
  skippedCount: Type.Number(),
});

export type UpsertCatalogItemsResponse = Static<
  typeof UpsertCatalogItemsResponse
>;

export const CompleteCatalogSyncRequest = Type.Object({
  workspaceId: Type.String(),
  catalogName: Type.String(),
  syncId: Type.String({ minLength: 1, maxLength: 128 }),
});

export type CompleteCatalogSyncRequest = Static<
  typeof CompleteCatalogSyncRequest
>;

export const CompleteCatalogSyncResponse = Type.Object({
  /**
   * Items that this sync did not mention. They are archived rather than
   * deleted, so a feed that drops a page cannot erase a catalog. They stay
   * queryable by id until the grace period expires.
   */
  archivedCount: Type.Number(),
  itemCount: Type.Number(),
});

export type CompleteCatalogSyncResponse = Static<
  typeof CompleteCatalogSyncResponse
>;

/**
 * Pull a feed-sourced catalog now instead of waiting for the scheduler. Used by
 * operators after a feed change, and by tests.
 */
export const SyncCatalogRequest = Type.Object({
  workspaceId: Type.String(),
  catalogName: Type.String(),
});

export type SyncCatalogRequest = Static<typeof SyncCatalogRequest>;

export const SyncCatalogResponse = Type.Object({
  syncRunId: Type.String(),
  status: Type.Union([
    Type.Literal("ok"),
    Type.Literal("partial"),
    Type.Literal("failed"),
  ]),
  upsertedCount: Type.Number(),
  archivedCount: Type.Number(),
  skippedCount: Type.Number(),
  /** Present when the sync failed, e.g. the feed returned a 404. */
  error: Type.Optional(Type.String()),
});

export type SyncCatalogResponse = Static<typeof SyncCatalogResponse>;

export const DeleteCatalogItemsRequest = Type.Object({
  workspaceId: Type.String(),
  catalogName: Type.String(),
  itemIds: Type.Array(Type.String(), { minItems: 1, maxItems: 5000 }),
});

export type DeleteCatalogItemsRequest = Static<typeof DeleteCatalogItemsRequest>;

export const ReadCatalogItemsRequest = Type.Object({
  workspaceId: Type.String(),
  catalogName: Type.String(),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000 })),
  cursor: Type.Optional(Type.String()),
  /** Filters to one side of the product/variant relationship. */
  itemType: Type.Optional(
    Type.Enum(CatalogItemType),
  ),
  parentItemId: Type.Optional(Type.String()),
  status: Type.Optional(CatalogItemStatusSchema),
});

export type ReadCatalogItemsRequest = Static<typeof ReadCatalogItemsRequest>;

export const ReadCatalogItemsResponse = Type.Object({
  items: Type.Array(CatalogItemResource),
  itemCount: Type.Number(),
  nextCursor: Type.Optional(Type.String()),
});

export type ReadCatalogItemsResponse = Static<typeof ReadCatalogItemsResponse>;

export const CatalogCategoryResource = Type.Object({
  name: Type.String(),
  itemCount: Type.Number(),
});

export type CatalogCategoryResource = Static<
  typeof CatalogCategoryResource
>;

export const ReadCatalogCategoriesRequest = Type.Object({
  workspaceId: Type.String(),
  catalogName: Type.String(),
});

export type ReadCatalogCategoriesRequest = Static<
  typeof ReadCatalogCategoriesRequest
>;

export const ReadCatalogCategoriesResponse = Type.Object({
  categories: Type.Array(CatalogCategoryResource),
});

export type ReadCatalogCategoriesResponse = Static<
  typeof ReadCatalogCategoriesResponse
>;

/**
 * Outcome of one sync run. Exposed so an operator can tell "this catalog has
 * been stale for three days" from "this catalog is fine".
 */
export const CatalogSyncRunResource = Type.Object({
  id: Type.String(),
  catalogName: Type.String(),
  kind: CatalogSyncKindSchema,
  syncId: Type.Optional(Type.String()),
  status: Type.Union([
    Type.Literal("running"),
    Type.Literal("ok"),
    Type.Literal("partial"),
    Type.Literal("failed"),
  ]),
  upsertedCount: Type.Number(),
  deletedCount: Type.Number(),
  skippedCount: Type.Number(),
  error: Type.Optional(Type.String()),
  startedAt: Type.Number(),
  finishedAt: Type.Optional(Type.Number()),
});

export type CatalogSyncRunResource = Static<typeof CatalogSyncRunResource>;

export const ReadCatalogSyncRunsRequest = Type.Object({
  workspaceId: Type.String(),
  catalogName: Type.String(),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});

export type ReadCatalogSyncRunsRequest = Static<
  typeof ReadCatalogSyncRunsRequest
>;

export const ReadCatalogSyncRunsResponse = Type.Object({
  runs: Type.Array(CatalogSyncRunResource),
});

export type ReadCatalogSyncRunsResponse = Static<
  typeof ReadCatalogSyncRunsResponse
>;

export const CatalogCollectionResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  catalogName: Type.String(),
  definition: CatalogCollectionDefinition,
  createdAt: Type.Number(),
  updatedAt: Type.Number(),
});

export type CatalogCollectionResource = Static<
  typeof CatalogCollectionResource
>;

export const ReadCatalogCollectionsRequest = Type.Object({
  workspaceId: Type.String(),
});

export type ReadCatalogCollectionsRequest = Static<
  typeof ReadCatalogCollectionsRequest
>;

export const ReadCatalogCollectionsResponse = Type.Object({
  collections: Type.Array(CatalogCollectionResource),
});

export type ReadCatalogCollectionsResponse = Static<
  typeof ReadCatalogCollectionsResponse
>;

export const UpsertCatalogCollectionResource = Type.Object({
  workspaceId: Type.String(),
  name: Type.String({ minLength: 1, maxLength: 255 }),
  catalogName: Type.String({ minLength: 1 }),
  definition: CatalogCollectionDefinition,
});

export type UpsertCatalogCollectionResource = Static<
  typeof UpsertCatalogCollectionResource
>;

export const UpsertCatalogCollectionResponse = Type.Object({
  collection: CatalogCollectionResource,
});

export type UpsertCatalogCollectionResponse = Static<
  typeof UpsertCatalogCollectionResponse
>;

export const DeleteCatalogCollectionRequest = Type.Object({
  workspaceId: Type.String(),
  name: Type.String(),
});

export type DeleteCatalogCollectionRequest = Static<
  typeof DeleteCatalogCollectionRequest
>;

export const PreviewCatalogCollectionRequest = Type.Object({
  workspaceId: Type.String(),
  catalogName: Type.String(),
  definition: CatalogCollectionDefinition,
});

export type PreviewCatalogCollectionRequest = Static<
  typeof PreviewCatalogCollectionRequest
>;

export const PreviewCatalogCollectionResponse = Type.Object({
  items: Type.Array(CatalogItemResource),
  // Number of items matching the definition, ignoring `limit`.
  itemCount: Type.Number(),
  // Number of items returned in this response, i.e. `items.length`.
  returnedCount: Type.Number(),
  /** Freshness of the data behind this preview, so stale data is never silent. */
  dataFreshness: Type.Optional(
    Type.Object({
      lastSyncedAt: Type.Optional(Type.Number()),
      syncStatus: CatalogSyncStatusSchema,
    }),
  ),
});

export type PreviewCatalogCollectionResponse = Static<
  typeof PreviewCatalogCollectionResponse
>;

/**
 * Wire shape for an unsuccessful catalog request. Deliberately looser than
 * `CatalogError`: a request that fails schema validation is serialized with this
 * schema too, and its code is Fastify's own (e.g. `FST_ERR_VALIDATION`). Typing
 * the response against the narrow domain codes turns those 400s into 500s.
 */
export const CatalogErrorResponse = Type.Object({
  message: Type.String(),
  code: Type.Optional(Type.String()),
  statusCode: Type.Optional(Type.Number()),
});

export type CatalogErrorResponse = Static<typeof CatalogErrorResponse>;

export const CatalogError = Type.Object({
  message: Type.String(),
  /**
   * Machine readable error kind, used to pick an HTTP status:
   * `notFound` -> 404, `conflict` -> 409, otherwise 400.
   */
  code: Type.Optional(
    Type.Union([
      Type.Literal("notFound"),
      Type.Literal("invalid"),
      Type.Literal("conflict"),
    ]),
  ),
});

export type CatalogError = Static<typeof CatalogError>;

export const DeleteCatalogItemsResponse = Type.Object({
  deletedCount: Type.Number(),
});

export type DeleteCatalogItemsResponse = Static<
  typeof DeleteCatalogItemsResponse
>;

/**
 * What a profile did with a catalog item.
 *
 * The first three are inferred from tracking calls that carry item references;
 * `backInStock` is an explicit subscription. Kept as separate rows so a restock
 * notification does not overwrite a purchase signal, and so a price drop can
 * target viewers and carters without re-notifying buyers.
 */
export enum CatalogInterestKind {
  Viewed = "viewed",
  Cart = "cart",
  Purchased = "purchased",
  BackInStock = "backInStock",
}

export const CatalogInterestKindSchema = Type.Enum(CatalogInterestKind);

export const CatalogItemInterestResource = Type.Object({
  itemId: Type.String(),
  kind: CatalogInterestKindSchema,
  eventCount: Type.Number(),
  lastEventAt: Type.Number(),
  /** Back-in-stock only: when the restock was announced, if it was. */
  notifiedAt: Type.Optional(Type.Number()),
});

export type CatalogItemInterestResource = Static<
  typeof CatalogItemInterestResource
>;

export const ReadCatalogItemInterestsRequest = Type.Object({
  workspaceId: Type.String(),
  catalogName: Type.String(),
  userId: Type.String(),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
});

export type ReadCatalogItemInterestsRequest = Static<
  typeof ReadCatalogItemInterestsRequest
>;

export const ReadCatalogItemInterestsResponse = Type.Object({
  interests: Type.Array(CatalogItemInterestResource),
});

export type ReadCatalogItemInterestsResponse = Static<
  typeof ReadCatalogItemInterestsResponse
>;

/**
 * Subscribe a profile to a restock notification for one item.
 *
 * Idempotent: subscribing twice keeps one row and clears the previous
 * notification marker, so a user who asks again after a restock is notified
 * again next time.
 */
export const SubscribeCatalogItemRequest = Type.Object({
  workspaceId: Type.String(),
  catalogName: Type.String(),
  userId: Type.String(),
  itemId: Type.String(),
});

export type SubscribeCatalogItemRequest = Static<
  typeof SubscribeCatalogItemRequest
>;

export const SubscribeCatalogItemResponse = Type.Object({
  subscribed: Type.Boolean(),
  itemId: Type.String(),
});

export type SubscribeCatalogItemResponse = Static<
  typeof SubscribeCatalogItemResponse
>;
