import { Static, Type } from "@sinclair/typebox";

/**
 * Catalogs and catalog collections.
 *
 * A catalog is a named set of items (e.g. a product catalog). Each item has an
 * `itemId` plus a free-form `attributes` object.
 *
 * A catalog collection is a named, saved query over a single catalog: a filter
 * tree, an optional sort, and a limit. Templates reference collections through
 * the `catalog_collection` liquid tag:
 *
 *   {% catalog_collection "BestSellerShoes" as items %}
 *     {% for item in items %}{{ item.title }}{% endfor %}
 *   {% endcatalog_collection %}
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

export const CatalogFilterOperator = Type.Union([
  Type.Literal("Equals"),
  Type.Literal("NotEquals"),
  Type.Literal("In"),
  Type.Literal("NotIn"),
  Type.Literal("Contains"),
  Type.Literal("Exists"),
  Type.Literal("GreaterThan"),
  Type.Literal("GreaterThanOrEqual"),
  Type.Literal("LessThan"),
  Type.Literal("LessThanOrEqual"),
]);

export type CatalogFilterOperator = Static<typeof CatalogFilterOperator>;

export const CatalogFilterScalar = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
]);

export type CatalogFilterScalar = Static<typeof CatalogFilterScalar>;

export enum CatalogFilterType {
  Field = "Field",
  And = "And",
  Or = "Or",
}

export const CatalogFieldFilter = Type.Object({
  type: Type.Literal("Field"),
  // Dotted path into the item's attributes, e.g. "CATEGORY" or "size.UK".
  field: Type.String(),
  operator: CatalogFilterOperator,
  // Omitted for the Exists operator. An array is required for In / NotIn.
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
  field: Type.String(),
  direction: Type.Optional(CatalogSortDirection),
});

export type CatalogSortField = Static<typeof CatalogSortField>;

export const CatalogCollectionDefinition = Type.Object({
  filter: Type.Optional(CatalogFilter),
  sort: Type.Optional(Type.Array(CatalogSortField)),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  // When set, only these attribute paths are returned for each item.
  itemProperties: Type.Optional(Type.Array(Type.String())),
});

export type CatalogCollectionDefinition = Static<
  typeof CatalogCollectionDefinition
>;

/**
 * The attribute payload of a single catalog item. Rendered templates access
 * these as `item.<key>`.
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
  itemCount: Type.Number(),
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

export const CatalogItemResource = Type.Object({
  itemId: Type.String(),
  attributes: CatalogItemAttributes,
  createdAt: Type.Optional(Type.Number()),
  updatedAt: Type.Optional(Type.Number()),
});

export type CatalogItemResource = Static<typeof CatalogItemResource>;

export const UpsertCatalogItemsRequest = Type.Object({
  workspaceId: Type.String(),
  catalogName: Type.String(),
  items: Type.Array(
    Type.Object({
      itemId: Type.String({ minLength: 1 }),
      attributes: CatalogItemAttributes,
    }),
    { minItems: 1, maxItems: 5000 },
  ),
  // When true, items in the catalog that are not present in this request are
  // deleted. Used for full catalog syncs.
  replace: Type.Optional(Type.Boolean()),
});

export type UpsertCatalogItemsRequest = Static<
  typeof UpsertCatalogItemsRequest
>;

export const UpsertCatalogItemsResponse = Type.Object({
  upsertedCount: Type.Number(),
  deletedCount: Type.Number(),
  itemCount: Type.Number(),
});

export type UpsertCatalogItemsResponse = Static<
  typeof UpsertCatalogItemsResponse
>;

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
});

export type ReadCatalogItemsRequest = Static<typeof ReadCatalogItemsRequest>;

export const ReadCatalogItemsResponse = Type.Object({
  items: Type.Array(CatalogItemResource),
  itemCount: Type.Number(),
  nextCursor: Type.Optional(Type.String()),
});

export type ReadCatalogItemsResponse = Static<typeof ReadCatalogItemsResponse>;

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
  itemCount: Type.Number(),
});

export type PreviewCatalogCollectionResponse = Static<
  typeof PreviewCatalogCollectionResponse
>;

export const CatalogError = Type.Object({
  message: Type.String(),
});

export type CatalogError = Static<typeof CatalogError>;

export const DeleteCatalogItemsResponse = Type.Object({
  deletedCount: Type.Number(),
});

export type DeleteCatalogItemsResponse = Static<
  typeof DeleteCatalogItemsResponse
>;
