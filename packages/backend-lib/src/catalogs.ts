import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  notInArray,
  or,
  SQL,
  sql,
} from "drizzle-orm";
import {
  CatalogCategoryResource,
  CatalogCollectionDefinition,
  CatalogFilter,
  CatalogFilterOperatorType,
  CatalogInventoryPolicy,
  CatalogItemAttributes,
  CatalogItemInput,
  CatalogItemResource,
  CatalogItemStatus,
  CatalogItemType,
  CatalogResource,
  CatalogSortField,
  CatalogSourceType,
  CatalogSyncKind,
  CatalogSyncRunResource,
  CatalogSyncStatus,
} from "isomorphic-lib/src/catalog";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import { db } from "./db";
import {
  catalog as dbCatalog,
  catalogCollection as dbCatalogCollection,
  catalogItem as dbCatalogItem,
  catalogSyncRun as dbCatalogSyncRun,
} from "./db/schema";
import logger from "./logger";

const DEFAULT_COLLECTION_LIMIT = 10;
const MAX_COLLECTION_LIMIT = 500;
const ITEM_UPSERT_CHUNK_SIZE = 500;
/**
 * Items that stop being mentioned by a sync are archived, then removed once
 * this grace period has passed. The delay exists so that a feed that returns a
 * truncated page — or a sync that is aborted halfway — cannot destroy a catalog
 * that is still being referenced by a template.
 */
const DEFAULT_STALE_GRACE_DAYS = 7;
/**
 * Collections are resolved once per message today, which would issue one query
 * per message during a broadcast. A short lived cache keeps that cost bounded
 * while limiting the staleness window after a catalog is updated. Writes clear
 * the cache in the process that performed them; other processes (api vs
 * worker) converge within the TTL.
 */
const COLLECTION_CACHE_TTL_MS = 30 * 1_000;
const COLLECTION_CACHE_MAX_ENTRIES = 1_000;

export interface CatalogError {
  message: string;
  code?: "notFound" | "invalid" | "conflict";
}

const CATALOG_COLLECTION_TAG = "catalog_collection";

/**
 * The attribute path restriction keeps untrusted template input out of the
 * generated SQL fragment used to address jsonb keys.
 */
const ALLOWED_PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * Item fields that address a typed column. Everything else resolves to a key in
 * `attributes`. Keeping this mapping in one place is what lets a collection say
 * `price > 50` and get an index scan instead of a per-row jsonb extraction.
 */
type FieldKind = "text" | "number" | "boolean" | "array";

const RESERVED_ITEM_FIELDS: Record<string, FieldKind> = {
  itemId: "text",
  parentItemId: "text",
  itemType: "text",
  title: "text",
  description: "text",
  url: "text",
  imageUrl: "text",
  brand: "text",
  price: "number",
  compareAtPrice: "number",
  priceMin: "number",
  priceMax: "number",
  currency: "text",
  inventoryQuantity: "number",
  inventoryTotal: "number",
  inStock: "boolean",
  status: "text",
  variantCount: "number",
  categories: "array",
  tags: "array",
  createdAt: "text",
  updatedAt: "text",
};

const SOURCE_TYPE_BY_VALUE: Record<string, CatalogSourceType | undefined> = {
  api: CatalogSourceType.Api,
  feed: CatalogSourceType.Feed,
};

const ITEM_STATUS_BY_VALUE: Record<string, CatalogItemStatus | undefined> = {
  published: CatalogItemStatus.Published,
  draft: CatalogItemStatus.Draft,
  archived: CatalogItemStatus.Archived,
};

const INVENTORY_POLICY_BY_VALUE: Record<
  string,
  CatalogInventoryPolicy | undefined
> = {
  deny: CatalogInventoryPolicy.Deny,
  continue: CatalogInventoryPolicy.Continue,
};

const SYNC_STATUS_BY_VALUE: Record<string, CatalogSyncStatus | undefined> = {
  never: CatalogSyncStatus.Never,
  ok: CatalogSyncStatus.Ok,
  partial: CatalogSyncStatus.Partial,
  failed: CatalogSyncStatus.Failed,
};

const SYNC_KIND_BY_VALUE: Record<string, CatalogSyncKind | undefined> = {
  items: CatalogSyncKind.Items,
  price: CatalogSyncKind.Price,
  inventory: CatalogSyncKind.Inventory,
};

const SYNC_RUN_STATUS_BY_VALUE: Record<
  string,
  "ok" | "partial" | "failed" | "running" | undefined
> = {
  ok: "ok",
  partial: "partial",
  failed: "failed",
  running: "running",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldKind(field: string): FieldKind {
  return RESERVED_ITEM_FIELDS[field] ?? "text";
}

function filterValidationError(filter: CatalogFilter): string | undefined {
  switch (filter.type) {
    case "And":
    case "Or": {
      for (const child of filter.children) {
        const problem = filterValidationError(child);
        if (problem) {
          return problem;
        }
      }
      return undefined;
    }
    case "Field": {
      const { field, operator, value } = filter;
      const segments = field.split(".");
      if (!segments.every((segment) => ALLOWED_PATH_SEGMENT.test(segment))) {
        return `Invalid attribute path: ${field}`;
      }
      const kind = fieldKind(field);
      if (
        kind === "array" &&
        operator !== CatalogFilterOperatorType.Contains &&
        operator !== CatalogFilterOperatorType.In
      ) {
        return `${field} is a list field; use Contains or In`;
      }
      switch (operator) {
        case "Exists":
          return undefined;
        case "In":
        case "NotIn":
          return Array.isArray(value)
            ? undefined
            : `${operator} requires an array value`;
        case "GreaterThan":
        case "GreaterThanOrEqual":
        case "LessThan":
        case "LessThanOrEqual":
          if (kind === "array" || kind === "boolean") {
            return `${operator} is not supported for ${field}`;
          }
          if (kind === "number") {
            return value !== undefined && Number.isFinite(Number(value))
              ? undefined
              : `${operator} requires a numeric value`;
          }
          return `${operator} requires a numeric field`;
        case "Equals":
        case "NotEquals":
        case "Contains":
          return value === undefined
            ? `${operator} requires a value`
            : undefined;
        default:
          return `Unsupported operator: ${String(operator)}`;
      }
    }
    default:
      return "Unsupported catalog filter";
  }
}

/**
 * Validates a collection definition before it is stored. Two things are
 * checked here rather than at query time: the shape (TypeBox) and the
 * semantics of each filter (which operators make sense for the field they
 * address). A definition that fails is rejected at write time, so a stored
 * collection is always queryable.
 */
export function validateCollectionDefinition(
  definition: unknown,
): Result<CatalogCollectionDefinition, CatalogError> {
  const validated = schemaValidateWithErr(
    definition,
    CatalogCollectionDefinition,
  );
  if (validated.isErr()) {
    return err({
      code: "invalid",
      message: `Invalid catalog collection: ${validated.error.message}`,
    });
  }
  if (validated.value.filter) {
    const problem = filterValidationError(validated.value.filter);
    if (problem) {
      return err({ code: "invalid", message: problem });
    }
  }
  for (const sort of validated.value.sort ?? []) {
    const segments = sort.field.split(".");
    if (!segments.every((segment) => ALLOWED_PATH_SEGMENT.test(segment))) {
      return err({
        code: "invalid",
        message: `Invalid sort field: ${sort.field}`,
      });
    }
  }
  for (const property of validated.value.itemProperties ?? []) {
    const segments = property.split(".");
    if (!segments.every((segment) => ALLOWED_PATH_SEGMENT.test(segment))) {
      return err({
        code: "invalid",
        message: `Invalid item property: ${property}`,
      });
    }
  }
  return ok(validated.value);
}

/**
 * A stored definition is re-validated on read: it lives in a jsonb column, so
 * rows written by older versions (or by a buggy client) can hold shapes that
 * the query builder would throw on. An invalid definition resolves to "no
 * items" rather than "no filter", so a broken collection renders empty instead
 * of returning an arbitrary page of the catalog.
 */
function collectionDefinition(
  value: unknown,
): CatalogCollectionDefinition | null {
  const validated = validateCollectionDefinition(value);
  return validated.isOk() ? validated.value : null;
}

function assertValidFieldPath(field: string): string[] {
  const segments = field.split(".");
  const invalid = segments.some(
    (segment) => !ALLOWED_PATH_SEGMENT.test(segment) || !segment.length,
  );
  if (invalid || !segments.length) {
    throw new Error(`Invalid catalog attribute path: ${field}`);
  }
  return segments;
}

function jsonbPathLiteral(field: string): SQL {
  const segments = assertValidFieldPath(field);
  return sql.raw(`'{${segments.join(",")}}'`);
}

function attributeJson(field: string): SQL {
  return sql`${dbCatalogItem.attributes} #> ${jsonbPathLiteral(field)}`;
}

function attributeText(field: string): SQL {
  return sql`${dbCatalogItem.attributes} #>> ${jsonbPathLiteral(field)}`;
}

/**
 * Column behind a reserved field name. `null` means the field lives in
 * `attributes`.
 */
function reservedColumn(field: string): SQL | null {
  switch (field) {
    case "itemId":
      return sql`${dbCatalogItem.itemId}`;
    case "parentItemId":
      return sql`${dbCatalogItem.parentItemId}`;
    case "itemType":
      return sql`${dbCatalogItem.itemType}`;
    case "title":
      return sql`${dbCatalogItem.title}`;
    case "description":
      return sql`${dbCatalogItem.description}`;
    case "url":
      return sql`${dbCatalogItem.url}`;
    case "imageUrl":
      return sql`${dbCatalogItem.imageUrl}`;
    case "brand":
      return sql`${dbCatalogItem.brand}`;
    case "price":
      return sql`${dbCatalogItem.price}`;
    case "compareAtPrice":
      return sql`${dbCatalogItem.compareAtPrice}`;
    case "priceMin":
      return sql`${dbCatalogItem.priceMin}`;
    case "priceMax":
      return sql`${dbCatalogItem.priceMax}`;
    case "currency":
      return sql`${dbCatalogItem.currency}`;
    case "inventoryQuantity":
      return sql`${dbCatalogItem.inventoryQuantity}`;
    case "inventoryTotal":
      return sql`${dbCatalogItem.inventoryTotal}`;
    case "inStock":
      return sql`${dbCatalogItem.inStock}`;
    case "status":
      return sql`${dbCatalogItem.status}`;
    case "variantCount":
      return sql`${dbCatalogItem.variantCount}`;
    case "categories":
      return sql`${dbCatalogItem.categories}`;
    case "tags":
      return sql`${dbCatalogItem.tags}`;
    default:
      return null;
  }
}

/** Text projection of a field, used by the string operators. */
function fieldText(field: string): SQL {
  const column = reservedColumn(field);
  if (!column) {
    return attributeText(field);
  }
  const kind = fieldKind(field);
  if (kind === "number" || kind === "boolean") {
    return sql`(${column})::text`;
  }
  return column;
}

/** Numeric projection of a field, used by the comparison operators. */
function fieldNumber(field: string): SQL {
  const column = reservedColumn(field);
  return column
    ? sql`(${column})::numeric`
    : sql`(${attributeText(field)})::numeric`;
}

function filterToSql(filter: CatalogFilter): SQL {
  switch (filter.type) {
    case "And":
    case "Or": {
      if (!filter.children.length) {
        return sql`true`;
      }
      const separator = filter.type === "And" ? sql` and ` : sql` or `;
      return sql`(${sql.join(
        filter.children.map((child) => filterToSql(child)),
        separator,
      )})`;
    }
    case "Field": {
      const { field, operator, value } = filter;
      const kind = fieldKind(field);
      const isList = kind === "array";
      switch (operator) {
        case "Exists": {
          const column = reservedColumn(field);
          if (column) {
            return isList
              ? sql`coalesce(cardinality(${column}), 0) > 0`
              : sql`(${column}) is not null`;
          }
          return sql`(${attributeJson(field)}) is not null`;
        }
        case "Equals":
          if (isList) {
            return sql`${String(value)} = any(${reservedColumn(field)})`;
          }
          return sql`(${fieldText(field)}) = ${String(value)}`;
        case "NotEquals":
          if (isList) {
            return sql`not (${String(value)} = any(${reservedColumn(field)}))`;
          }
          return sql`coalesce((${fieldText(field)}) <> ${String(value)}, true)`;
        case "In":
        case "NotIn": {
          if (!Array.isArray(value)) {
            throw new Error(`Catalog filter ${operator} requires an array`);
          }
          if (!value.length) {
            return operator === CatalogFilterOperatorType.In
              ? sql`false`
              : sql`true`;
          }
          if (isList) {
            const list = sql.join(
              value.map((entry) => sql`${String(entry)}`),
              sql`, `,
            );
            return operator === CatalogFilterOperatorType.In
              ? sql`${reservedColumn(field)} && array[${list}]::text[]`
              : sql`not (${reservedColumn(field)} && array[${list}]::text[])`;
          }
          const list = sql.join(
            value.map((entry) => sql`${String(entry)}`),
            sql`, `,
          );
          return operator === CatalogFilterOperatorType.In
            ? sql`(${fieldText(field)}) in (${list})`
            : sql`(${fieldText(field)}) not in (${list})`;
        }
        case "Contains":
          if (isList) {
            return sql`${reservedColumn(field)} @> array[${String(value)}]::text[]`;
          }
          if (kind === "number" || kind === "boolean") {
            return sql`position(${String(value)} in (${fieldText(field)})) > 0`;
          }
          if (reservedColumn(field)) {
            return sql`(${fieldText(field)}) ilike ${`%${String(value)}%`}`;
          }
          // Arrays stored in `attributes` need `@>`; scalars fall back to a
          // case-insensitive substring match, matching how Iterable's catalog
          // collections behaved for free-form fields.
          return sql`case when jsonb_typeof(${attributeJson(
            field,
          )}) = 'array' then (${attributeJson(field)}) @> ${JSON.stringify([
            value,
          ])}::jsonb else (${attributeText(field)}) ilike ${`%${String(
            value,
          )}%`} end`;
        case "GreaterThan":
          return sql`(${fieldNumber(field)}) > ${Number(value)}`;
        case "GreaterThanOrEqual":
          return sql`(${fieldNumber(field)}) >= ${Number(value)}`;
        case "LessThan":
          return sql`(${fieldNumber(field)}) < ${Number(value)}`;
        case "LessThanOrEqual":
          return sql`(${fieldNumber(field)}) <= ${Number(value)}`;
        default:
          throw new Error(
            `Unsupported catalog filter operator: ${String(operator)}`,
          );
      }
    }
  }
}

function fieldNumberOrText(field: string): SQL {
  const kind = fieldKind(field);
  if (kind === "number") {
    return fieldNumber(field);
  }
  return fieldText(field);
}

/** The item shape exposed to templates and to the API. */
function collectionLimit(definition: CatalogCollectionDefinition): number {
  const limit = definition.limit ?? DEFAULT_COLLECTION_LIMIT;
  return Math.min(Math.max(limit, 1), MAX_COLLECTION_LIMIT);
}

function orderBy(definition: CatalogCollectionDefinition): SQL[] {
  const sorts: CatalogSortField[] = definition.sort?.length
    ? definition.sort
    : [{ field: "itemId", direction: "asc" }];
  const clauses = sorts.map(({ field, direction }) => {
    const sqlDirection = direction === "desc" ? "desc" : "asc";
    return sql`(${fieldNumberOrText(field)}) ${sql.raw(sqlDirection)} nulls last`;
  });
  // Stable tiebreaker so repeated renders return the same order.
  clauses.push(sql`${dbCatalogItem.itemId} asc`);
  return clauses;
}

function toItemResource(
  row: typeof dbCatalogItem.$inferSelect,
): CatalogItemResource {
  return {
    itemId: row.itemId,
    itemType:
      row.itemType === "variant"
        ? CatalogItemType.Variant
        : CatalogItemType.Product,
    parentItemId: row.parentItemId ?? undefined,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    url: row.url ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    brand: row.brand ?? undefined,
    price: row.price ?? undefined,
    compareAtPrice: row.compareAtPrice ?? undefined,
    currency: row.currency ?? undefined,
    priceMin: row.priceMin ?? undefined,
    priceMax: row.priceMax ?? undefined,
    inventoryTotal: row.inventoryTotal ?? undefined,
    variantCount: row.variantCount ?? undefined,
    inventoryQuantity: row.inventoryQuantity ?? undefined,
    inventoryPolicy: row.inventoryPolicy
      ? INVENTORY_POLICY_BY_VALUE[row.inventoryPolicy]
      : undefined,
    inStock: row.inStock,
    status: ITEM_STATUS_BY_VALUE[row.status] ?? CatalogItemStatus.Published,
    categories: row.categories ?? [],
    tags: row.tags ?? [],
    attributes: isRecord(row.attributes) ? row.attributes : {},
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

/**
 * Flattens an item for Liquid: typed fields plus `attributes`, so templates can
 * address `item.title` and `item.CATEGORY` the same way. `itemProperties`
 * narrows the result to the paths a collection asked for.
 */
function projectItem(
  item: CatalogItemResource,
  itemProperties?: string[],
): CatalogItemAttributes {
  const flattened: CatalogItemAttributes = {
    ...item.attributes,
    itemId: item.itemId,
    itemType: item.itemType,
  };
  const optional: [string, unknown][] = [
    ["parentItemId", item.parentItemId],
    ["title", item.title],
    ["description", item.description],
    ["url", item.url],
    ["imageUrl", item.imageUrl],
    ["brand", item.brand],
    ["price", item.price],
    ["compareAtPrice", item.compareAtPrice],
    ["currency", item.currency],
    ["priceMin", item.priceMin],
    ["priceMax", item.priceMax],
    ["inventoryQuantity", item.inventoryQuantity],
    ["inventoryPolicy", item.inventoryPolicy],
    ["status", item.status],
  ];
  for (const [key, value] of optional) {
    if (value !== undefined) {
      flattened[key] = value;
    }
  }
  flattened.inStock = item.inStock;
  flattened.categories = item.categories;
  flattened.tags = item.tags;

  if (!itemProperties?.length) {
    return flattened;
  }
  const projected: CatalogItemAttributes = {};
  for (const property of itemProperties) {
    const segments = assertValidFieldPath(property);
    let cursor: unknown = flattened;
    for (const segment of segments) {
      if (!isRecord(cursor)) {
        cursor = undefined;
        break;
      }
      cursor = cursor[segment];
    }
    if (cursor !== undefined) {
      projected[property] = cursor;
    }
  }
  // Identity is not optional: templates build product links, dedupe rows and
  // join back to a product page from these fields, so projection narrows the
  // payload without removing the keys that make an item addressable.
  projected.itemId = item.itemId;
  projected.itemType = item.itemType;
  if (item.parentItemId !== undefined) {
    projected.parentItemId = item.parentItemId;
  }
  return projected;
}

/**
 * Extracts the names of every catalog collection referenced by a template.
 * Used to preload collections before rendering, since rendering itself is
 * synchronous.
 */
export function extractCatalogCollectionNames(template: string): string[] {
  const names = new Set<string>();
  // Comments and raw blocks are not rendered, so tags inside them must not
  // trigger a collection lookup.
  const renderable = template
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "")
    .replace(/\{%-?\s*raw\s*-?%\}[\s\S]*?\{%-?\s*endraw\s*-?%\}/g, "");
  const pattern = new RegExp(
    `\\{%-?\\s*${CATALOG_COLLECTION_TAG}\\s+(?:"([^"]+)"|'([^']+)')`,
    "g",
  );
  for (const match of renderable.matchAll(pattern)) {
    const name = match[1] ?? match[2];
    if (name) {
      names.add(name);
    }
  }
  return [...names];
}

export function extractCatalogCollectionNamesFromTemplates(
  templates: Record<string, string | undefined>,
): string[] {
  const names = new Set<string>();
  for (const template of Object.values(templates)) {
    if (typeof template !== "string") {
      continue;
    }
    for (const name of extractCatalogCollectionNames(template)) {
      names.add(name);
    }
  }
  return [...names];
}

interface ResolvedCollection {
  catalogId: string;
  definition: CatalogCollectionDefinition;
}

async function findCollectionsByName({
  workspaceId,
  names,
}: {
  workspaceId: string;
  names: string[];
}): Promise<Map<string, ResolvedCollection>> {
  const result = new Map<string, ResolvedCollection>();
  if (!names.length) {
    return result;
  }
  const rows = await db()
    .select({
      name: dbCatalogCollection.name,
      catalogId: dbCatalogCollection.catalogId,
      definition: dbCatalogCollection.definition,
    })
    .from(dbCatalogCollection)
    .where(
      and(
        eq(dbCatalogCollection.workspaceId, workspaceId),
        inArray(dbCatalogCollection.name, names),
      ),
    );
  for (const row of rows) {
    const definition = collectionDefinition(row.definition);
    if (!definition) {
      logger().warn(
        { workspaceId, collectionName: row.name },
        "Catalog collection has an invalid definition; rendering it as empty",
      );
      continue;
    }
    result.set(row.name, {
      catalogId: row.catalogId,
      definition,
    });
  }
  return result;
}

async function findCatalogByName({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}): Promise<{ id: string } | null> {
  const row = await db()
    .select({ id: dbCatalog.id })
    .from(dbCatalog)
    .where(
      and(eq(dbCatalog.workspaceId, workspaceId), eq(dbCatalog.name, name)),
    )
    .limit(1);
  return row[0] ?? null;
}

/**
 * Default visibility for a collection query. A product block should not show
 * archived items or variants that cannot be bought, unless it says so — that is
 * the behavior a marketer gets from Klaviyo without configuring anything.
 */
function collectionConditions(
  catalogId: string,
  definition: CatalogCollectionDefinition,
): SQL[] {
  const conditions: SQL[] = [sql`${dbCatalogItem.catalogId} = ${catalogId}`];
  if (!definition.includeUnpublished) {
    conditions.push(sql`${dbCatalogItem.status} = 'published'`);
  }
  if (!definition.includeOutOfStock) {
    conditions.push(sql`${dbCatalogItem.inStock} = true`);
  }
  if (definition.filter) {
    conditions.push(filterToSql(definition.filter));
  }
  return conditions;
}

async function queryCollectionItems({
  catalogId,
  definition,
}: {
  catalogId: string;
  definition: CatalogCollectionDefinition;
}): Promise<CatalogItemResource[]> {
  const rows = await db()
    .select()
    .from(dbCatalogItem)
    .where(and(...collectionConditions(catalogId, definition)))
    .orderBy(...orderBy(definition))
    .limit(collectionLimit(definition));
  return rows.map(toItemResource);
}

async function countCollectionItems({
  catalogId,
  definition,
}: {
  catalogId: string;
  definition: CatalogCollectionDefinition;
}): Promise<number> {
  const rows = await db()
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(dbCatalogItem)
    .where(and(...collectionConditions(catalogId, definition)));
  return rows[0]?.count ?? 0;
}

interface CachedCollection {
  items: CatalogItemAttributes[];
  expiresAt: number;
}

const collectionCache = new Map<string, CachedCollection>();

/** Drops every cached collection. Called after any catalog write. */
export function clearCatalogCache(): void {
  collectionCache.clear();
}

function collectionCacheKey(workspaceId: string, name: string): string {
  return `${workspaceId}:${name}`;
}

function readCollectionCache(
  workspaceId: string,
  name: string,
): CatalogItemAttributes[] | undefined {
  const key = collectionCacheKey(workspaceId, name);
  const entry = collectionCache.get(key);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    collectionCache.delete(key);
    return undefined;
  }
  return entry.items;
}

function writeCollectionCache(
  workspaceId: string,
  name: string,
  items: CatalogItemAttributes[],
): void {
  if (COLLECTION_CACHE_TTL_MS <= 0) {
    return;
  }
  const key = collectionCacheKey(workspaceId, name);
  if (
    collectionCache.size >= COLLECTION_CACHE_MAX_ENTRIES &&
    !collectionCache.has(key)
  ) {
    // Map iteration order is insertion order, so this evicts the oldest entry.
    const oldest = collectionCache.keys().next();
    if (!oldest.done) {
      collectionCache.delete(oldest.value);
    }
  }
  collectionCache.set(key, {
    items,
    expiresAt: Date.now() + COLLECTION_CACHE_TTL_MS,
  });
}

/**
 * Resolves catalog collections to their items, keyed by collection name. The
 * result is placed on the liquid render scope as `catalogs`.
 *
 * Resolution never throws: a missing, misconfigured, or unqueryable collection
 * resolves to an empty list so that a catalog problem can not fail a send.
 */
export async function resolveCatalogCollections({
  workspaceId,
  names,
}: {
  workspaceId: string;
  names: string[];
}): Promise<Record<string, CatalogItemAttributes[]>> {
  const resolved: Record<string, CatalogItemAttributes[]> = {};
  const uncached: string[] = [];
  for (const name of new Set(names)) {
    const cached = readCollectionCache(workspaceId, name);
    if (cached) {
      resolved[name] = cached;
    } else {
      uncached.push(name);
    }
  }
  if (!uncached.length) {
    return resolved;
  }

  let collections: Map<string, ResolvedCollection>;
  try {
    collections = await findCollectionsByName({
      workspaceId,
      names: uncached,
    });
  } catch (error) {
    logger().error(
      { err: error, workspaceId, collectionNames: uncached },
      "Failed to load catalog collections; rendering them as empty",
    );
    for (const name of uncached) {
      resolved[name] = [];
    }
    return resolved;
  }

  await Promise.all(
    uncached.map(async (name) => {
      const collection = collections.get(name);
      if (!collection) {
        logger().warn(
          { workspaceId, collectionName: name },
          "Catalog collection referenced by template was not found",
        );
        resolved[name] = [];
        return;
      }
      try {
        const rows = await queryCollectionItems({
          catalogId: collection.catalogId,
          definition: collection.definition,
        });
        const items = rows.map((row) =>
          projectItem(row, collection.definition.itemProperties),
        );
        resolved[name] = items;
        writeCollectionCache(workspaceId, name, items);
      } catch (error) {
        logger().warn(
          { err: error, workspaceId, collectionName: name },
          "Failed to resolve catalog collection; rendering it as empty",
        );
        resolved[name] = [];
      }
    }),
  );
  return resolved;
}

/**
 * Convenience wrapper for the send path: extracts collection names from a set
 * of templates and resolves them.
 */
export async function loadCatalogsForTemplates({
  workspaceId,
  templates,
}: {
  workspaceId: string;
  templates: Record<string, string | undefined>;
}): Promise<Record<string, CatalogItemAttributes[]>> {
  const names = extractCatalogCollectionNamesFromTemplates(templates);
  try {
    return await resolveCatalogCollections({ workspaceId, names });
  } catch (error) {
    logger().error(
      { err: error, workspaceId, collectionNames: names },
      "Failed to load catalog collections; rendering them as empty",
    );
    return {};
  }
}

function toCatalogResource(
  row: typeof dbCatalog.$inferSelect,
  counts: { itemCount: number; variantCount: number },
): CatalogResource {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    sourceType: SOURCE_TYPE_BY_VALUE[row.sourceType] ?? CatalogSourceType.Api,
    currency: row.currency,
    locale: row.locale ?? undefined,
    itemCount: counts.itemCount,
    variantCount: counts.variantCount,
    syncStatus: SYNC_STATUS_BY_VALUE[row.syncStatus] ?? CatalogSyncStatus.Never,
    lastSyncedAt: row.lastSyncedAt?.getTime(),
    lastPriceSyncedAt: row.lastPriceSyncedAt?.getTime(),
    lastInventorySyncedAt: row.lastInventorySyncedAt?.getTime(),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function listCatalogs({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<CatalogResource[]> {
  const rows = await db()
    .select({
      catalog: dbCatalog,
      itemCount: sql<number>`count(${dbCatalogItem.id})`.mapWith(Number),
      variantCount:
        sql<number>`count(${dbCatalogItem.id}) filter (where ${dbCatalogItem.itemType} = 'variant')`.mapWith(
          Number,
        ),
    })
    .from(dbCatalog)
    .leftJoin(
      dbCatalogItem,
      and(
        eq(dbCatalogItem.catalogId, dbCatalog.id),
        sql`${dbCatalogItem.status} <> 'archived'`,
      ),
    )
    .where(eq(dbCatalog.workspaceId, workspaceId))
    .groupBy(dbCatalog.id)
    .orderBy(asc(dbCatalog.name));

  return rows.map((row) =>
    toCatalogResource(row.catalog, {
      itemCount: row.itemCount,
      variantCount: row.variantCount,
    }),
  );
}

export async function readCatalog({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}): Promise<Result<CatalogResource, CatalogError>> {
  const rows = await db()
    .select({
      catalog: dbCatalog,
      itemCount: sql<number>`count(${dbCatalogItem.id})`.mapWith(Number),
      variantCount:
        sql<number>`count(${dbCatalogItem.id}) filter (where ${dbCatalogItem.itemType} = 'variant')`.mapWith(
          Number,
        ),
    })
    .from(dbCatalog)
    .leftJoin(
      dbCatalogItem,
      and(
        eq(dbCatalogItem.catalogId, dbCatalog.id),
        sql`${dbCatalogItem.status} <> 'archived'`,
      ),
    )
    .where(
      and(eq(dbCatalog.workspaceId, workspaceId), eq(dbCatalog.name, name)),
    )
    .groupBy(dbCatalog.id)
    .limit(1);
  const row = rows[0];
  if (!row) {
    return err({ code: "notFound", message: `Catalog ${name} not found` });
  }
  return ok(
    toCatalogResource(row.catalog, {
      itemCount: row.itemCount,
      variantCount: row.variantCount,
    }),
  );
}

export async function upsertCatalog({
  workspaceId,
  name,
  sourceType,
  currency,
  locale,
}: {
  workspaceId: string;
  name: string;
  sourceType?: string;
  currency?: string;
  locale?: string;
}): Promise<Result<CatalogResource, CatalogError>> {
  const rows = await db()
    .insert(dbCatalog)
    .values({
      workspaceId,
      name,
      sourceType: sourceType ?? "api",
      currency: currency ?? "USD",
      locale,
    })
    .onConflictDoUpdate({
      target: [dbCatalog.workspaceId, dbCatalog.name],
      set: {
        ...(sourceType ? { sourceType } : {}),
        ...(currency ? { currency } : {}),
        ...(locale ? { locale } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();
  const row = rows[0];
  if (!row) {
    return err({ message: `Failed to upsert catalog ${name}` });
  }
  return ok(
    toCatalogResource(row, {
      itemCount: 0,
      variantCount: 0,
    }),
  );
}

export async function deleteCatalog({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}): Promise<Result<void, CatalogError>> {
  const existing = await findCatalogByName({ workspaceId, name });
  if (!existing) {
    return err({ code: "notFound", message: `Catalog ${name} not found` });
  }
  await db().delete(dbCatalog).where(eq(dbCatalog.id, existing.id));
  clearCatalogCache();
  return ok(undefined);
}

async function countCatalogItems(catalogId: string): Promise<number> {
  const rows = await db()
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(dbCatalogItem)
    .where(
      and(
        eq(dbCatalogItem.catalogId, catalogId),
        sql`${dbCatalogItem.status} <> 'archived'`,
      ),
    );
  return rows[0]?.count ?? 0;
}

/** Whether an item can be bought right now. */
function computeInStock(
  inventoryQuantity: number | null | undefined,
  inventoryPolicy: string | null | undefined,
): boolean {
  // A backorderable item is always buyable.
  if (inventoryPolicy === "continue") {
    return true;
  }
  // An item that does not track inventory is assumed to be available.
  if (inventoryQuantity === null || inventoryQuantity === undefined) {
    return true;
  }
  return inventoryQuantity > 0;
}

/**
 * Columns an item upsert may write. A request is treated as one uniform shape:
 * a column is written for every item in the request if any item mentioned it,
 * and left untouched otherwise. That is what allows a `price` sync to send only
 * `{ itemId, price }` without nulling every other column on the row.
 */
const WRITABLE_COLUMNS = [
  "itemType",
  "parentItemId",
  "title",
  "description",
  "url",
  "imageUrl",
  "brand",
  "price",
  "compareAtPrice",
  "currency",
  "inventoryQuantity",
  "inventoryPolicy",
  "status",
  "categories",
  "tags",
  "attributes",
] as const;

type WritableColumn = (typeof WRITABLE_COLUMNS)[number];

function providedColumns(items: CatalogItemInput[]): Set<WritableColumn> {
  const provided = new Set<WritableColumn>();
  for (const item of items) {
    for (const column of WRITABLE_COLUMNS) {
      if (item[column] !== undefined) {
        provided.add(column);
      }
    }
  }
  return provided;
}

function itemRowValues({
  workspaceId,
  catalogId,
  item,
  syncId,
  provided,
  isPriceSync,
  isInventorySync,
}: {
  workspaceId: string;
  catalogId: string;
  item: CatalogItemInput;
  syncId?: string;
  provided: Set<WritableColumn>;
  isPriceSync: boolean;
  isInventorySync: boolean;
}) {
  const inventoryQuantity = isPriceSync ? null : item.inventoryQuantity ?? null;
  const inventoryPolicy = isPriceSync ? null : item.inventoryPolicy ?? null;
  return {
    workspaceId,
    catalogId,
    itemId: item.itemId,
    itemType: item.itemType ?? "product",
    parentItemId: provided.has("parentItemId")
      ? item.parentItemId ?? null
      : null,
    title: provided.has("title") ? item.title ?? null : null,
    description: provided.has("description") ? item.description ?? null : null,
    url: provided.has("url") ? item.url ?? null : null,
    imageUrl: provided.has("imageUrl") ? item.imageUrl ?? null : null,
    brand: provided.has("brand") ? item.brand ?? null : null,
    price: provided.has("price") ? item.price ?? null : null,
    compareAtPrice: provided.has("compareAtPrice")
      ? item.compareAtPrice ?? null
      : null,
    currency: provided.has("currency") ? item.currency ?? null : null,
    inventoryQuantity,
    // An explicit policy is kept; otherwise the previous value is untouched,
    // which the SET clause expresses by omitting the column.
    inventoryPolicy,
    // Recomputed from whichever of quantity/policy this request supplied.
    inStock: computeInStock(inventoryQuantity, inventoryPolicy),
    status: provided.has("status") ? item.status ?? "published" : "published",
    categories: provided.has("categories") ? item.categories ?? null : null,
    tags: provided.has("tags") ? item.tags ?? null : null,
    attributes: provided.has("attributes") ? item.attributes ?? {} : {},
    syncId: isInventorySync || isPriceSync ? null : syncId ?? null,
    lastSeenAt: isInventorySync || isPriceSync ? null : new Date(),
    deletedAt: null,
  };
}

/**
 * Recomputes product rollups from their variants. Products carry the same
 * numbers so that "cheapest in-stock shoe" is a single-table query; without
 * this the product side would need a self join on every render.
 *
 * A product with no variants keeps its own values, which is what makes a flat
 * (product-only) catalog work.
 */
async function recomputeProductRollups({
  catalogId,
  parentItemIds,
}: {
  catalogId: string;
  parentItemIds: string[];
}): Promise<void> {
  if (!parentItemIds.length) {
    return;
  }
  const idList = sql.join(
    parentItemIds.map((id) => sql`${id}`),
    sql`, `,
  );
  // Written with literal identifiers rather than drizzle column references
  // because the subquery addresses an aliased copy of the same table, which
  // would otherwise render as a qualified name.
  await db().execute(sql`
    update "CatalogItem" as p set
      "priceMin" = r.min_price,
      "priceMax" = r.max_price,
      "inventoryTotal" = r.total_inventory,
      "variantCount" = r.variant_count,
      "inStock" = r.any_in_stock,
      "updatedAt" = now()
    from (
      select
        "parentItemId" as parent_item_id,
        min("price") as min_price,
        max("price") as max_price,
        sum("inventoryQuantity") as total_inventory,
        count(*) as variant_count,
        bool_or("inStock") as any_in_stock
      from "CatalogItem"
      where "catalogId" = ${catalogId}
        and "parentItemId" in (${idList})
        and "status" <> 'archived'
      group by "parentItemId"
    ) as r
    where p."catalogId" = ${catalogId}
      and p."itemId" = r.parent_item_id
  `);
}

async function recordSyncRun({
  workspaceId,
  catalogId,
  kind,
  syncId,
  startedAt,
  outcome,
}: {
  workspaceId: string;
  catalogId: string;
  kind: CatalogSyncKind;
  syncId?: string;
  startedAt: Date;
  outcome: {
    status: "ok" | "partial" | "failed";
    upsertedCount: number;
    deletedCount: number;
    skippedCount: number;
    error?: string;
  };
}): Promise<void> {
  await db()
    .insert(dbCatalogSyncRun)
    .values({
      workspaceId,
      catalogId,
      kind,
      syncId,
      status: outcome.status,
      upsertedCount: outcome.upsertedCount,
      deletedCount: outcome.deletedCount,
      skippedCount: outcome.skippedCount,
      error: outcome.error?.slice(0, 4000),
      startedAt,
      finishedAt: new Date(),
    });
}

function syncStatusFor(_kind: CatalogSyncKind): string {
  // A completed sync of any kind means the catalog is reachable and fresh
  // enough for rendering. Per-channel freshness is tracked separately in
  // `lastPriceSyncedAt` / `lastInventorySyncedAt`.
  return "ok";
}

/**
 * Writes items into a catalog.
 *
 * `kind` selects which channel the write belongs to:
 * - `items` writes content and may delete (via `replace` or `syncId`).
 * - `price` and `inventory` only update their own columns on rows that already
 *   exist. They never insert and never delete, so a price feed that races a
 *   content sync cannot resurrect an item the content sync removed.
 */
export async function upsertCatalogItems({
  workspaceId,
  catalogName,
  items,
  kind = CatalogSyncKind.Items,
  replace = false,
  syncId,
}: {
  workspaceId: string;
  catalogName: string;
  items: CatalogItemInput[];
  kind?: CatalogSyncKind;
  replace?: boolean;
  syncId?: string;
}): Promise<
  Result<
    {
      upsertedCount: number;
      deletedCount: number;
      itemCount: number;
      skippedCount: number;
    },
    CatalogError
  >
> {
  const catalog = await findCatalogByName({ workspaceId, name: catalogName });
  if (!catalog) {
    return err({
      code: "notFound",
      message: `Catalog ${catalogName} not found. Create it before writing items.`,
    });
  }
  if (replace && syncId) {
    return err({
      code: "conflict",
      message:
        "`replace` and `syncId` are mutually exclusive. Use `replace` for a catalog that fits in one request, or `syncId` followed by a sync completion for larger catalogs.",
    });
  }
  if (kind !== CatalogSyncKind.Items && (replace || syncId)) {
    return err({
      code: "invalid",
      message: `\`replace\` and \`syncId\` only apply to kind: "items"`,
    });
  }

  const startedAt = new Date();
  const provided = providedColumns(items);
  const isPriceSync = kind === CatalogSyncKind.Price;
  const isInventorySync = kind === CatalogSyncKind.Inventory;

  // Price and inventory syncs are an update, not an upsert: an item the catalog
  // has never seen is reported as skipped rather than created, because a
  // price-only record would otherwise produce an item with no title or URL.
  if (isPriceSync || isInventorySync) {
    const existing = await db()
      .select({ itemId: dbCatalogItem.itemId })
      .from(dbCatalogItem)
      .where(
        and(
          eq(dbCatalogItem.catalogId, catalog.id),
          inArray(
            dbCatalogItem.itemId,
            items.map((item) => item.itemId),
          ),
        ),
      );
    const known = new Set(existing.map((row) => row.itemId));
    const unknown = items.filter((item) => !known.has(item.itemId));
    const writable = items.filter((item) => known.has(item.itemId));
    if (!writable.length) {
      await recordSyncRun({
        workspaceId,
        catalogId: catalog.id,
        kind,
        syncId,
        startedAt,
        outcome: {
          status: "partial",
          upsertedCount: 0,
          deletedCount: 0,
          skippedCount: unknown.length,
          error: "None of the items exist in this catalog.",
        },
      });
      return err({
        code: "invalid",
        message: `None of the ${items.length} items exist in catalog ${catalogName}. A ${kind} sync only updates existing items.`,
      });
    }

    // Only the columns this sync carries are written. A price feed that does not
    // mention stock must not reset it, and vice versa.
    const columns = (
      isPriceSync
        ? (["price", "compareAtPrice", "currency"] as const)
        : (["inventoryQuantity", "inventoryPolicy"] as const)
    ).filter((column) => provided.has(column));
    const casts: Record<string, string> = {
      price: "numeric",
      compareAtPrice: "numeric",
      currency: "text",
      inventoryQuantity: "int",
      inventoryPolicy: "text",
    };

    // A set-based UPDATE ... FROM (VALUES ...) rather than one statement per
    // item: price and inventory feeds are the high frequency path, so this
    // stays a single round trip per chunk. (`excluded` is only available to
    // INSERT ... ON CONFLICT, which is why this is hand written.)
    const parentItemIds = new Set<string>();
    await db().transaction(async (tx) => {
      for (let i = 0; i < writable.length; i += ITEM_UPSERT_CHUNK_SIZE) {
        const chunk = writable.slice(i, i + ITEM_UPSERT_CHUNK_SIZE);
        const valueRows = chunk.map((item) => {
          const cells: SQL[] = [sql`${item.itemId}::text`];
          for (const column of columns) {
            const value = item[column] ?? null;
            cells.push(sql`${value}::${sql.raw(casts[column] ?? "text")}`);
          }
          if (!isPriceSync) {
            cells.push(
              sql`${computeInStock(
                item.inventoryQuantity,
                item.inventoryPolicy,
              )}::boolean`,
            );
          }
          return sql`(${sql.join(cells, sql`, `)})`;
        });
        const columnNames = [
          "item_id",
          ...columns,
          ...(isPriceSync ? [] : ["inStock"]),
        ];
        const assignments = columns.map(
          (column) =>
            sql`${sql.raw(`"${column}"`)} = v.${sql.raw(`"${column}"`)}`,
        );
        if (!isPriceSync) {
          assignments.push(sql`"inStock" = v."inStock"`);
        }
        assignments.push(sql`"lastSeenAt" = now()`, sql`"updatedAt" = now()`);

        // eslint-disable-next-line no-await-in-loop
        const result = await tx.execute(sql`
          update "CatalogItem" as p
          set ${sql.join(assignments, sql`, `)}
          from (values ${sql.join(valueRows, sql`, `)})
            as v(${sql.join(
              columnNames.map((name) => sql.raw(`"${name}"`)),
              sql`, `,
            )})
          where p."catalogId" = ${catalog.id} and p."itemId" = v."item_id"
          returning p."parentItemId"
        `);
        for (const row of result.rows) {
          const { parentItemId } = row;
          if (typeof parentItemId === "string" && parentItemId.length) {
            parentItemIds.add(parentItemId);
          }
        }
      }
    });
    // Rollups live in a separate statement because the update above has to be
    // visible to it.
    await recomputeProductRollups({
      catalogId: catalog.id,
      parentItemIds: [...parentItemIds],
    });

    const column =
      kind === CatalogSyncKind.Price
        ? "lastPriceSyncedAt"
        : "lastInventorySyncedAt";
    await db()
      .update(dbCatalog)
      .set({
        [column]: new Date(),
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dbCatalog.id, catalog.id));

    await recordSyncRun({
      workspaceId,
      catalogId: catalog.id,
      kind,
      syncId,
      startedAt,
      outcome: {
        status: unknown.length ? "partial" : "ok",
        upsertedCount: writable.length,
        deletedCount: 0,
        skippedCount: unknown.length,
      },
    });

    clearCatalogCache();
    return ok({
      upsertedCount: writable.length,
      deletedCount: 0,
      itemCount: await countCatalogItems(catalog.id),
      skippedCount: unknown.length,
    });
  }

  const parentItemIds = new Set<string>();
  for (const item of items) {
    if (item.parentItemId) {
      parentItemIds.add(item.parentItemId);
    }
  }

  let deletedCount = 0;
  const rows = items.map((item) =>
    itemRowValues({
      workspaceId,
      catalogId: catalog.id,
      item,
      syncId,
      provided,
      isPriceSync: false,
      isInventorySync: false,
    }),
  );

  // Only the columns this request actually carries are written on conflict. A
  // content sync that omits `inventoryQuantity` therefore leaves stock levels
  // alone rather than resetting them.
  const set: Record<string, SQL> = {};
  for (const column of provided) {
    set[column] = sql.raw(`excluded."${column}"`);
  }
  set.itemType = sql.raw('excluded."itemType"');
  set.inStock = sql.raw('excluded."inStock"');
  set.deletedAt = sql`null`;
  set.lastSeenAt = sql`now()`;
  set.updatedAt = sql`now()`;
  if (syncId) {
    set.syncId = sql.raw('excluded."syncId"');
  }

  if (replace) {
    // The delete and every chunk are applied in one transaction so that a
    // partially applied replace can never be read by a concurrent render.
    deletedCount = await db().transaction(async (tx) => {
      const itemIds = items.map((item) => item.itemId);
      const deleted = await tx
        .delete(dbCatalogItem)
        .where(
          and(
            eq(dbCatalogItem.catalogId, catalog.id),
            notInArray(dbCatalogItem.itemId, itemIds),
          ),
        )
        .returning({ itemId: dbCatalogItem.itemId });
      for (let i = 0; i < rows.length; i += ITEM_UPSERT_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + ITEM_UPSERT_CHUNK_SIZE);
        // eslint-disable-next-line no-await-in-loop
        await tx
          .insert(dbCatalogItem)
          .values(chunk)
          .onConflictDoUpdate({
            target: [dbCatalogItem.catalogId, dbCatalogItem.itemId],
            set,
          });
      }
      return deleted.length;
    });
  } else {
    for (let i = 0; i < rows.length; i += ITEM_UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + ITEM_UPSERT_CHUNK_SIZE);
      // Chunks are written in sequence to keep a single large sync from opening
      // thousands of concurrent statements.
      // eslint-disable-next-line no-await-in-loop
      await db()
        .insert(dbCatalogItem)
        .values(chunk)
        .onConflictDoUpdate({
          target: [dbCatalogItem.catalogId, dbCatalogItem.itemId],
          set,
        });
    }
  }

  const parentIds = [...parentItemIds];
  if (!parentIds.length) {
    // Items may have been given a parent in a previous request; recompute every
    // product that now has variants so a variant-only chunk still refreshes its
    // product rollups.
    const products = await db()
      .select({ itemId: dbCatalogItem.itemId })
      .from(dbCatalogItem)
      .where(
        and(
          eq(dbCatalogItem.catalogId, catalog.id),
          eq(dbCatalogItem.itemType, "product"),
          inArray(
            dbCatalogItem.itemId,
            items.map((item) => item.itemId),
          ),
        ),
      );
    parentIds.push(...products.map((row) => row.itemId));
  }
  await recomputeProductRollups({
    catalogId: catalog.id,
    parentItemIds: parentIds,
  });

  await db()
    .update(dbCatalog)
    .set({
      syncStatus: syncStatusFor(kind),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dbCatalog.id, catalog.id));

  await recordSyncRun({
    workspaceId,
    catalogId: catalog.id,
    kind,
    syncId,
    startedAt,
    outcome: {
      status: "ok",
      upsertedCount: items.length,
      deletedCount,
      skippedCount: 0,
    },
  });

  clearCatalogCache();
  return ok({
    upsertedCount: items.length,
    deletedCount,
    itemCount: await countCatalogItems(catalog.id),
    skippedCount: 0,
  });
}

/**
 * Removes items that were archived longer than the grace period ago. Archived
 * items remain queryable by id until this runs, so a feed that drops a product
 * for a day does not break a template that references it.
 */
export async function purgeArchivedCatalogItems({
  catalogId,
  graceDays = DEFAULT_STALE_GRACE_DAYS,
}: {
  catalogId: string;
  graceDays?: number;
}): Promise<number> {
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);
  const deleted = await db()
    .delete(dbCatalogItem)
    .where(
      and(
        eq(dbCatalogItem.catalogId, catalogId),
        sql`${dbCatalogItem.deletedAt} is not null`,
        sql`${dbCatalogItem.deletedAt} < ${cutoff}`,
      ),
    )
    .returning({ itemId: dbCatalogItem.itemId });
  return deleted.length;
}

/**
 * Finishes a chunked catalog sync. Every item the sync did not mention is
 * archived rather than deleted: it stops appearing in collections immediately,
 * stays addressable by id, and is removed for good once the grace period
 * expires.
 *
 * Items from previous syncs stay visible until this call, so a render that
 * happens mid-sync sees a superset of the catalog rather than a partially
 * deleted one.
 */
export async function completeCatalogSync({
  workspaceId,
  catalogName,
  syncId,
  graceDays = DEFAULT_STALE_GRACE_DAYS,
}: {
  workspaceId: string;
  catalogName: string;
  syncId: string;
  graceDays?: number;
}): Promise<
  Result<{ archivedCount: number; itemCount: number }, CatalogError>
> {
  const catalog = await findCatalogByName({ workspaceId, name: catalogName });
  if (!catalog) {
    return err({
      code: "notFound",
      message: `Catalog ${catalogName} not found`,
    });
  }
  const synced = await db()
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(dbCatalogItem)
    .where(
      and(
        eq(dbCatalogItem.catalogId, catalog.id),
        eq(dbCatalogItem.syncId, syncId),
      ),
    );
  if (!synced[0]?.count) {
    // Guards against a typo (or a lost request) archiving the whole catalog.
    return err({
      code: "invalid",
      message: `No items were written with syncId ${syncId}. Refusing to archive stale items.`,
    });
  }
  const archived = await db()
    .update(dbCatalogItem)
    .set({
      status: "archived",
      deletedAt: new Date(),
      inStock: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(dbCatalogItem.catalogId, catalog.id),
        sql`${dbCatalogItem.status} <> 'archived'`,
        or(isNull(dbCatalogItem.syncId), ne(dbCatalogItem.syncId, syncId)),
      ),
    )
    .returning({ itemId: dbCatalogItem.itemId });

  await db()
    .update(dbCatalog)
    .set({ syncStatus: "ok", lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(dbCatalog.id, catalog.id));

  const purged = await purgeArchivedCatalogItems({
    catalogId: catalog.id,
    graceDays,
  });
  if (purged) {
    logger().info(
      { catalogId: catalog.id, purged },
      "Removed catalog items past the stale grace period",
    );
  }

  clearCatalogCache();
  return ok({
    archivedCount: archived.length,
    itemCount: await countCatalogItems(catalog.id),
  });
}

export async function deleteCatalogItems({
  workspaceId,
  catalogName,
  itemIds,
}: {
  workspaceId: string;
  catalogName: string;
  itemIds: string[];
}): Promise<Result<{ deletedCount: number }, CatalogError>> {
  const catalog = await findCatalogByName({ workspaceId, name: catalogName });
  if (!catalog) {
    return err({
      code: "notFound",
      message: `Catalog ${catalogName} not found`,
    });
  }
  const deleted = await db()
    .delete(dbCatalogItem)
    .where(
      and(
        eq(dbCatalogItem.catalogId, catalog.id),
        inArray(dbCatalogItem.itemId, itemIds),
      ),
    )
    .returning({ itemId: dbCatalogItem.itemId });
  clearCatalogCache();
  return ok({ deletedCount: deleted.length });
}

export async function listCatalogItems({
  workspaceId,
  catalogName,
  limit = 100,
  cursor,
  itemType,
  parentItemId,
  status,
}: {
  workspaceId: string;
  catalogName: string;
  limit?: number;
  cursor?: string;
  itemType?: CatalogItemType;
  parentItemId?: string;
  status?: CatalogItemStatus;
}): Promise<
  Result<
    { items: CatalogItemResource[]; itemCount: number; nextCursor?: string },
    CatalogError
  >
> {
  const catalog = await findCatalogByName({ workspaceId, name: catalogName });
  if (!catalog) {
    return err({
      code: "notFound",
      message: `Catalog ${catalogName} not found`,
    });
  }
  const clamped = Math.min(Math.max(limit, 1), 5000);
  const conditions: SQL[] = [sql`${dbCatalogItem.catalogId} = ${catalog.id}`];
  if (status) {
    conditions.push(sql`${dbCatalogItem.status} = ${status}`);
  } else {
    // Archived items are still addressable when asked for by status, but they
    // do not pollute a default listing.
    conditions.push(sql`${dbCatalogItem.status} <> 'archived'`);
  }
  if (cursor) {
    conditions.push(sql`${dbCatalogItem.itemId} > ${cursor}`);
  }
  if (itemType) {
    conditions.push(sql`${dbCatalogItem.itemType} = ${itemType}`);
  }
  if (parentItemId) {
    conditions.push(sql`${dbCatalogItem.parentItemId} = ${parentItemId}`);
  }
  const rows = await db()
    .select()
    .from(dbCatalogItem)
    .where(and(...conditions))
    .orderBy(asc(dbCatalogItem.itemId))
    .limit(clamped + 1);

  const totalCountRow = await db()
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(dbCatalogItem)
    .where(
      and(
        eq(dbCatalogItem.catalogId, catalog.id),
        sql`${dbCatalogItem.status} <> 'archived'`,
      ),
    );
  const itemCount = totalCountRow[0]?.count ?? 0;

  const hasMore = rows.length > clamped;
  const page = hasMore ? rows.slice(0, clamped) : rows;
  return ok({
    items: page.map(toItemResource),
    itemCount,
    nextCursor: hasMore ? page[page.length - 1]?.itemId : undefined,
  });
}

/** Category names present in a catalog, with how many items carry each one. */
export async function listCatalogCategories({
  workspaceId,
  catalogName,
  limit = 200,
}: {
  workspaceId: string;
  catalogName: string;
  limit?: number;
}): Promise<Result<CatalogCategoryResource[], CatalogError>> {
  const catalog = await findCatalogByName({ workspaceId, name: catalogName });
  if (!catalog) {
    return err({
      code: "notFound",
      message: `Catalog ${catalogName} not found`,
    });
  }
  const rows = await db()
    .select({
      name: sql<string>`category`,
      itemCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(
      sql`(select unnest(${dbCatalogItem.categories}) as category from ${dbCatalogItem} where ${dbCatalogItem.catalogId} = ${catalog.id} and ${dbCatalogItem.status} <> 'archived') as categories`,
    )
    .groupBy(sql`category`)
    // Ties are broken by name so the facet list is stable between requests.
    .orderBy(sql`count(*) desc`, sql`category asc`)
    .limit(Math.min(Math.max(limit, 1), 1000));
  return ok(rows);
}

export async function listCatalogSyncRuns({
  workspaceId,
  catalogName,
  limit = 20,
}: {
  workspaceId: string;
  catalogName: string;
  limit?: number;
}): Promise<Result<CatalogSyncRunResource[], CatalogError>> {
  const catalog = await findCatalogByName({ workspaceId, name: catalogName });
  if (!catalog) {
    return err({
      code: "notFound",
      message: `Catalog ${catalogName} not found`,
    });
  }
  const rows = await db()
    .select()
    .from(dbCatalogSyncRun)
    .where(
      and(
        eq(dbCatalogSyncRun.catalogId, catalog.id),
        eq(dbCatalogSyncRun.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(dbCatalogSyncRun.startedAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  return ok(
    rows.map((row) => ({
      id: row.id,
      catalogName,
      kind: SYNC_KIND_BY_VALUE[row.kind] ?? CatalogSyncKind.Items,
      syncId: row.syncId ?? undefined,
      status: SYNC_RUN_STATUS_BY_VALUE[row.status] ?? "running",
      upsertedCount: row.upsertedCount,
      deletedCount: row.deletedCount,
      skippedCount: row.skippedCount,
      error: row.error ?? undefined,
      startedAt: row.startedAt.getTime(),
      finishedAt: row.finishedAt?.getTime(),
    })),
  );
}

export async function listCatalogCollections({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<
  {
    id: string;
    workspaceId: string;
    name: string;
    catalogName: string;
    definition: CatalogCollectionDefinition;
    createdAt: number;
    updatedAt: number;
  }[]
> {
  const rows = await db()
    .select({
      id: dbCatalogCollection.id,
      workspaceId: dbCatalogCollection.workspaceId,
      name: dbCatalogCollection.name,
      catalogName: dbCatalog.name,
      definition: dbCatalogCollection.definition,
      createdAt: dbCatalogCollection.createdAt,
      updatedAt: dbCatalogCollection.updatedAt,
    })
    .from(dbCatalogCollection)
    .innerJoin(dbCatalog, eq(dbCatalog.id, dbCatalogCollection.catalogId))
    .where(eq(dbCatalogCollection.workspaceId, workspaceId))
    .orderBy(asc(dbCatalogCollection.name));

  return rows.map((row) => ({
    ...row,
    // Listing is an authoring path, not a render path: an invalid definition is
    // shown as empty so the collection can be edited, while rendering treats it
    // as "no items".
    definition: collectionDefinition(row.definition) ?? {},
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }));
}

export async function upsertCatalogCollection({
  workspaceId,
  name,
  catalogName,
  definition,
}: {
  workspaceId: string;
  name: string;
  catalogName: string;
  definition: CatalogCollectionDefinition;
}): Promise<
  Result<
    {
      id: string;
      workspaceId: string;
      name: string;
      catalogName: string;
      definition: CatalogCollectionDefinition;
      createdAt: number;
      updatedAt: number;
    },
    CatalogError
  >
> {
  const catalog = await findCatalogByName({ workspaceId, name: catalogName });
  if (!catalog) {
    return err({
      code: "notFound",
      message: `Catalog ${catalogName} not found`,
    });
  }
  const validated = validateCollectionDefinition(definition);
  if (validated.isErr()) {
    return err(validated.error);
  }
  const rows = await db()
    .insert(dbCatalogCollection)
    .values({
      workspaceId,
      name,
      catalogId: catalog.id,
      definition: validated.value,
    })
    .onConflictDoUpdate({
      target: [dbCatalogCollection.workspaceId, dbCatalogCollection.name],
      set: {
        catalogId: catalog.id,
        definition: validated.value,
        updatedAt: new Date(),
      },
    })
    .returning();
  const row = rows[0];
  if (!row) {
    return err({ message: `Failed to upsert catalog collection ${name}` });
  }

  clearCatalogCache();
  return ok({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    catalogName,
    definition: collectionDefinition(row.definition) ?? {},
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  });
}

export async function deleteCatalogCollection({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}): Promise<Result<void, CatalogError>> {
  const deleted = await db()
    .delete(dbCatalogCollection)
    .where(
      and(
        eq(dbCatalogCollection.workspaceId, workspaceId),
        eq(dbCatalogCollection.name, name),
      ),
    )
    .returning({ id: dbCatalogCollection.id });
  if (!deleted.length) {
    return err({
      code: "notFound",
      message: `Catalog collection ${name} not found`,
    });
  }
  clearCatalogCache();
  return ok(undefined);
}

export async function previewCatalogCollection({
  workspaceId,
  catalogName,
  definition,
}: {
  workspaceId: string;
  catalogName: string;
  definition: CatalogCollectionDefinition;
}): Promise<
  Result<
    {
      items: CatalogItemResource[];
      itemCount: number;
      returnedCount: number;
      dataFreshness?: {
        lastSyncedAt?: number;
        syncStatus: CatalogSyncStatus;
      };
    },
    CatalogError
  >
> {
  const catalog = await findCatalogByName({ workspaceId, name: catalogName });
  if (!catalog) {
    return err({
      code: "notFound",
      message: `Catalog ${catalogName} not found`,
    });
  }
  const validated = validateCollectionDefinition(definition);
  if (validated.isErr()) {
    return err(validated.error);
  }
  const rows = await queryCollectionItems({
    catalogId: catalog.id,
    definition: validated.value,
  });
  const itemCount = await countCollectionItems({
    catalogId: catalog.id,
    definition: validated.value,
  });
  const catalogRow = await db()
    .select({
      lastSyncedAt: dbCatalog.lastSyncedAt,
      syncStatus: dbCatalog.syncStatus,
    })
    .from(dbCatalog)
    .where(eq(dbCatalog.id, catalog.id))
    .limit(1);
  const freshness = catalogRow[0];
  return ok({
    items: rows,
    // `itemCount` is the number of items matching the definition, which can be
    // larger than the page returned because of `limit`.
    itemCount,
    returnedCount: rows.length,
    dataFreshness: freshness
      ? {
          lastSyncedAt: freshness.lastSyncedAt?.getTime(),
          syncStatus:
            SYNC_STATUS_BY_VALUE[freshness.syncStatus] ??
            CatalogSyncStatus.Never,
        }
      : undefined,
  });
}
