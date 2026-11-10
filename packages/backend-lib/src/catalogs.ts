import { and, asc, desc, eq, inArray, notInArray, SQL, sql } from "drizzle-orm";
import {
  CatalogCollectionDefinition,
  CatalogFilter,
  CatalogItemAttributes,
  CatalogItemResource,
  CatalogResource,
  CatalogSortField,
} from "isomorphic-lib/src/catalog";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import { db } from "./db";
import {
  catalog as dbCatalog,
  catalogCollection as dbCatalogCollection,
  catalogItem as dbCatalogItem,
} from "./db/schema";
import logger from "./logger";

const DEFAULT_COLLECTION_LIMIT = 10;
const MAX_COLLECTION_LIMIT = 500;
const ITEM_UPSERT_CHUNK_SIZE = 500;

export interface CatalogError {
  message: string;
}

const CATALOG_COLLECTION_TAG = "catalog_collection";

/**
 * The attribute path restriction keeps untrusted template input out of the
 * generated SQL fragment used to address jsonb keys.
 */
const ALLOWED_PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Collection definitions are stored as jsonb, so they are re-validated on read
 * rather than trusting the shape that was written.
 */
function collectionDefinition(value: unknown): CatalogCollectionDefinition {
  const validated = schemaValidateWithErr(value, CatalogCollectionDefinition);
  return validated.isOk() ? validated.value : {};
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
 * `itemId` addresses the item's primary key rather than an attribute, so that
 * collections can be pinned to specific items the same way they can filter on
 * any other field.
 */
function isItemIdField(field: string): boolean {
  return field === "itemId" || field === "id";
}

function fieldText(field: string): SQL {
  return isItemIdField(field)
    ? sql`${dbCatalogItem.itemId}`
    : attributeText(field);
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
      switch (operator) {
        case "Exists":
          if (isItemIdField(field)) {
            return sql`true`;
          }
          return sql`(${attributeJson(field)}) is not null`;
        case "Equals":
          return sql`(${fieldText(field)}) = ${String(value)}`;
        case "NotEquals":
          return sql`coalesce((${fieldText(field)}) <> ${String(value)}, true)`;
        case "In":
        case "NotIn": {
          if (!Array.isArray(value)) {
            throw new Error(`Catalog filter ${operator} requires an array`);
          }
          if (!value.length) {
            return operator === "In" ? sql`false` : sql`true`;
          }
          const list = sql.join(
            value.map((entry) => sql`${String(entry)}`),
            sql`, `,
          );
          return operator === "In"
            ? sql`(${fieldText(field)}) in (${list})`
            : sql`(${fieldText(field)}) not in (${list})`;
        }
        case "Contains":
          if (isItemIdField(field)) {
            return sql`(${fieldText(field)}) ilike ${`%${String(value)}%`}`;
          }
          return sql`case when jsonb_typeof(${attributeJson(
            field,
          )}) = 'array' then (${attributeJson(field)}) @> ${JSON.stringify([
            value,
          ])}::jsonb else (${attributeText(field)}) ilike ${`%${String(
            value,
          )}%`} end`;
        case "GreaterThan":
          return sql`((${fieldText(field)}))::numeric > ${Number(value)}`;
        case "GreaterThanOrEqual":
          return sql`((${fieldText(field)}))::numeric >= ${Number(value)}`;
        case "LessThan":
          return sql`((${fieldText(field)}))::numeric < ${Number(value)}`;
        case "LessThanOrEqual":
          return sql`((${fieldText(field)}))::numeric <= ${Number(value)}`;
        default:
          throw new Error(
            `Unsupported catalog filter operator: ${String(operator)}`,
          );
      }
    }
    default:
      throw new Error("Unsupported catalog filter");
  }
}

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
    if (field === "itemId" || field === "id") {
      return sqlDirection === "desc"
        ? desc(dbCatalogItem.itemId)
        : asc(dbCatalogItem.itemId);
    }
    return sql`(${attributeText(field)}) ${sql.raw(sqlDirection)}`;
  });
  // Stable tiebreaker so repeated renders return the same order.
  clauses.push(asc(dbCatalogItem.itemId));
  return clauses;
}

function projectItem(
  attributes: unknown,
  itemProperties?: string[],
): CatalogItemAttributes {
  const parsed = isRecord(attributes) ? attributes : {};
  if (!itemProperties?.length) {
    return parsed;
  }
  const projected: CatalogItemAttributes = {};
  for (const property of itemProperties) {
    const segments = assertValidFieldPath(property);
    let cursor: unknown = parsed;
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
  return projected;
}

/**
 * Extracts the names of every catalog collection referenced by a template.
 * Used to preload collections before rendering, since rendering itself is
 * synchronous.
 */
export function extractCatalogCollectionNames(template: string): string[] {
  const names = new Set<string>();
  const pattern = new RegExp(
    `\\{%-?\\s*${CATALOG_COLLECTION_TAG}\\s+(?:"([^"]+)"|'([^']+)')`,
    "g",
  );
  for (const match of template.matchAll(pattern)) {
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
    result.set(row.name, {
      catalogId: row.catalogId,
      definition: collectionDefinition(row.definition),
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

async function queryCollectionItems({
  catalogId,
  definition,
}: {
  catalogId: string;
  definition: CatalogCollectionDefinition;
}): Promise<CatalogItemAttributes[]> {
  const conditions: SQL[] = [sql`${dbCatalogItem.catalogId} = ${catalogId}`];
  if (definition.filter) {
    conditions.push(filterToSql(definition.filter));
  }
  const rows = await db()
    .select({
      itemId: dbCatalogItem.itemId,
      attributes: dbCatalogItem.attributes,
    })
    .from(dbCatalogItem)
    .where(and(...conditions))
    .orderBy(...orderBy(definition))
    .limit(collectionLimit(definition));

  // Attributes are flattened onto the item so templates can address them as
  // `item.<attribute>`, matching Iterable's catalog collection ergonomics.
  return rows.map((row) => ({
    itemId: row.itemId,
    ...projectItem(row.attributes, definition.itemProperties),
  }));
}

/**
 * Resolves catalog collections to their items, keyed by collection name. The
 * result is placed on the liquid render scope as `catalogs`.
 */
export async function resolveCatalogCollections({
  workspaceId,
  names,
}: {
  workspaceId: string;
  names: string[];
}): Promise<Record<string, CatalogItemAttributes[]>> {
  const resolved: Record<string, CatalogItemAttributes[]> = {};
  if (!names.length) {
    return resolved;
  }
  const collections = await findCollectionsByName({ workspaceId, names });
  await Promise.all(
    [...collections.entries()].map(async ([name, collection]) => {
      resolved[name] = await queryCollectionItems({
        catalogId: collection.catalogId,
        definition: collection.definition,
      });
    }),
  );
  for (const name of names) {
    if (!collections.has(name)) {
      logger().warn(
        { workspaceId, collectionName: name },
        "Catalog collection referenced by template was not found",
      );
      resolved[name] = [];
    }
  }
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
  return resolveCatalogCollections({ workspaceId, names });
}

export async function listCatalogs({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<CatalogResource[]> {
  const rows = await db()
    .select({
      id: dbCatalog.id,
      workspaceId: dbCatalog.workspaceId,
      name: dbCatalog.name,
      createdAt: dbCatalog.createdAt,
      updatedAt: dbCatalog.updatedAt,
      itemCount: sql<number>`count(${dbCatalogItem.id})`.mapWith(Number),
    })
    .from(dbCatalog)
    .leftJoin(dbCatalogItem, eq(dbCatalogItem.catalogId, dbCatalog.id))
    .where(eq(dbCatalog.workspaceId, workspaceId))
    .groupBy(
      dbCatalog.id,
      dbCatalog.workspaceId,
      dbCatalog.name,
      dbCatalog.createdAt,
      dbCatalog.updatedAt,
    )
    .orderBy(asc(dbCatalog.name));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }));
}

export async function upsertCatalog({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}): Promise<CatalogResource> {
  const rows = await db()
    .insert(dbCatalog)
    .values({ workspaceId, name })
    .onConflictDoUpdate({
      target: [dbCatalog.workspaceId, dbCatalog.name],
      set: { updatedAt: new Date() },
    })
    .returning();
  const row = rows[0];
  if (!row) {
    throw new Error(`Failed to upsert catalog ${name}`);
  }

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    itemCount: 0,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
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
    return err({ message: `Catalog ${name} not found` });
  }
  await db().delete(dbCatalog).where(eq(dbCatalog.id, existing.id));
  return ok(undefined);
}

async function countCatalogItems(catalogId: string): Promise<number> {
  const rows = await db()
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(dbCatalogItem)
    .where(eq(dbCatalogItem.catalogId, catalogId));
  return rows[0]?.count ?? 0;
}

export async function upsertCatalogItems({
  workspaceId,
  catalogName,
  items,
  replace = false,
}: {
  workspaceId: string;
  catalogName: string;
  items: { itemId: string; attributes: CatalogItemAttributes }[];
  replace?: boolean;
}): Promise<
  Result<
    { upsertedCount: number; deletedCount: number; itemCount: number },
    CatalogError
  >
> {
  const catalog = await findCatalogByName({ workspaceId, name: catalogName });
  if (!catalog) {
    return err({
      message: `Catalog ${catalogName} not found. Create it before writing items.`,
    });
  }

  let deletedCount = 0;
  if (replace) {
    const itemIds = items.map((item) => item.itemId);
    const deleted = await db()
      .delete(dbCatalogItem)
      .where(
        and(
          eq(dbCatalogItem.catalogId, catalog.id),
          notInArray(dbCatalogItem.itemId, itemIds),
        ),
      )
      .returning({ itemId: dbCatalogItem.itemId });
    deletedCount = deleted.length;
  }

  for (let i = 0; i < items.length; i += ITEM_UPSERT_CHUNK_SIZE) {
    const chunk = items.slice(i, i + ITEM_UPSERT_CHUNK_SIZE);
    // Chunks are written in sequence to keep a single large sync from opening
    // thousands of concurrent statements.
    // eslint-disable-next-line no-await-in-loop
    await db()
      .insert(dbCatalogItem)
      .values(
        chunk.map((item) => ({
          workspaceId,
          catalogId: catalog.id,
          itemId: item.itemId,
          attributes: item.attributes,
        })),
      )
      .onConflictDoUpdate({
        target: [dbCatalogItem.catalogId, dbCatalogItem.itemId],
        set: {
          attributes: sql`excluded."attributes"`,
          updatedAt: new Date(),
        },
      });
  }

  return ok({
    upsertedCount: items.length,
    deletedCount,
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
    return err({ message: `Catalog ${catalogName} not found` });
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
  return ok({ deletedCount: deleted.length });
}

export async function listCatalogItems({
  workspaceId,
  catalogName,
  limit = 100,
  cursor,
}: {
  workspaceId: string;
  catalogName: string;
  limit?: number;
  cursor?: string;
}): Promise<
  Result<
    { items: CatalogItemResource[]; itemCount: number; nextCursor?: string },
    CatalogError
  >
> {
  const catalog = await findCatalogByName({ workspaceId, name: catalogName });
  if (!catalog) {
    return err({ message: `Catalog ${catalogName} not found` });
  }
  const clamped = Math.min(Math.max(limit, 1), 5000);
  const conditions: SQL[] = [sql`${dbCatalogItem.catalogId} = ${catalog.id}`];
  if (cursor) {
    conditions.push(sql`${dbCatalogItem.itemId} > ${cursor}`);
  }
  const rows = await db()
    .select({
      itemId: dbCatalogItem.itemId,
      attributes: dbCatalogItem.attributes,
      createdAt: dbCatalogItem.createdAt,
      updatedAt: dbCatalogItem.updatedAt,
    })
    .from(dbCatalogItem)
    .where(and(...conditions))
    .orderBy(asc(dbCatalogItem.itemId))
    .limit(clamped + 1);

  const totalCountRow = await db()
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(dbCatalogItem)
    .where(eq(dbCatalogItem.catalogId, catalog.id));
  const itemCount = totalCountRow[0]?.count ?? 0;

  const hasMore = rows.length > clamped;
  const page = hasMore ? rows.slice(0, clamped) : rows;
  return ok({
    items: page.map((row) => ({
      itemId: row.itemId,
      attributes: projectItem(row.attributes),
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    })),
    itemCount,
    nextCursor: hasMore ? page[page.length - 1]?.itemId : undefined,
  });
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
    definition: collectionDefinition(row.definition),
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
    return err({ message: `Catalog ${catalogName} not found` });
  }
  const rows = await db()
    .insert(dbCatalogCollection)
    .values({
      workspaceId,
      name,
      catalogId: catalog.id,
      definition,
    })
    .onConflictDoUpdate({
      target: [dbCatalogCollection.workspaceId, dbCatalogCollection.name],
      set: {
        catalogId: catalog.id,
        definition,
        updatedAt: new Date(),
      },
    })
    .returning();
  const row = rows[0];
  if (!row) {
    return err({ message: `Failed to upsert catalog collection ${name}` });
  }

  return ok({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    catalogName,
    definition: collectionDefinition(row.definition),
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
    return err({ message: `Catalog collection ${name} not found` });
  }
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
  Result<{ items: CatalogItemResource[]; itemCount: number }, CatalogError>
> {
  const catalog = await findCatalogByName({ workspaceId, name: catalogName });
  if (!catalog) {
    return err({ message: `Catalog ${catalogName} not found` });
  }
  const items = await queryCollectionItems({
    catalogId: catalog.id,
    definition,
  });
  return ok({
    items: items.map((item) => {
      const { itemId, ...attributes } = item;
      return { itemId: String(itemId ?? ""), attributes };
    }),
    itemCount: items.length,
  });
}
