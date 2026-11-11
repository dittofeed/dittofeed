import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { PII_MASKED } from "isomorphic-lib/src/pii";

import { db } from "./db";
import {
  piiAccessAudit as dbPiiAccessAudit,
  piiField as dbPiiField,
} from "./db/schema";
import logger from "./logger";
import {
  PiiAccessAuditResource,
  PiiCategory,
  PiiFieldScope,
  PiiFieldScopeEnum,
} from "./types";

/**
 * Fields that are always available to the settings UI for classification,
 * regardless of what is present in the workspace. Scope `Column` names use
 * the `Table.column` convention.
 */
export const PII_COLUMN_CATALOG: {
  name: string;
  category: PiiCategory;
  description: string;
}[] = [
  {
    name: "WorkspaceMember.email",
    category: "Email",
    description: "登录邮箱",
  },
  {
    name: "WorkspaceMember.name",
    category: "Name",
    description: "成员姓名",
  },
  {
    name: "WorkspaceMember.nickname",
    category: "Name",
    description: "成员昵称",
  },
  {
    name: "WorkspaceMember.image",
    category: "Other",
    description: "成员头像 URL",
  },
  {
    name: "UserPropertyAssignment.value",
    category: "Other",
    description: "用户属性值（ClickHouse 中的具体取值）",
  },
  {
    name: "UserEvents.userId",
    category: "Other",
    description: "事件上的用户标识",
  },
  {
    name: "UserEvents.anonymousId",
    category: "Other",
    description: "事件上的匿名标识",
  },
  {
    name: "Deliveries.to",
    category: "Email",
    description: "投递收件人（邮箱或手机号）",
  },
  {
    name: "Deliveries.userId",
    category: "Other",
    description: "投递记录上的用户标识",
  },
];

export interface PiiPolicy {
  workspaceId: string;
  byScope: Record<PiiFieldScope, Set<string>>;
}

export interface PiiViewerContext {
  workspaceId: string;
  workspaceMemberId?: string;
  unmaskPii: boolean;
}

function fieldsFor(policy: PiiPolicy, scope: PiiFieldScope): Set<string> {
  return policy.byScope[scope];
}

export async function getPiiPolicy(workspaceId: string): Promise<PiiPolicy> {
  const rows = await db()
    .select({
      scope: dbPiiField.scope,
      name: dbPiiField.name,
    })
    .from(dbPiiField)
    .where(eq(dbPiiField.workspaceId, workspaceId));

  const byScope: Record<PiiFieldScope, Set<string>> = {
    [PiiFieldScopeEnum.UserProperty]: new Set(),
    [PiiFieldScopeEnum.EventProperty]: new Set(),
    [PiiFieldScopeEnum.Column]: new Set(),
  };
  for (const row of rows) {
    fieldsFor({ workspaceId, byScope }, row.scope).add(row.name.toLowerCase());
  }
  return { workspaceId, byScope };
}

export function isPiiField(
  policy: PiiPolicy,
  scope: PiiFieldScope,
  fieldName: string,
): boolean {
  return fieldsFor(policy, scope).has(fieldName.toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns a copy of `target` with `value` written at `path`, leaving the input
 * untouched. Intermediate segments that are not objects are left as-is, so a
 * scalar is never replaced by a partially masked object.
 */
function setPath<T extends Record<string, unknown>>(
  target: T,
  path: string[],
  value: unknown,
): T {
  const [head, ...rest] = path;
  if (head === undefined) {
    return target;
  }
  if (rest.length === 0) {
    return { ...target, [head]: value };
  }
  const existing: unknown = target[head];
  if (!isRecord(existing)) {
    return target;
  }
  return { ...target, [head]: setPath(existing, rest, value) };
}

function hasNestedValue(
  record: Record<string, unknown>,
  path: string[],
): boolean {
  const [head, ...rest] = path;
  if (head === undefined) {
    return false;
  }
  const value: unknown = record[head];
  if (rest.length === 0) {
    return Object.prototype.hasOwnProperty.call(record, head);
  }
  return isRecord(value) && hasNestedValue(value, rest);
}

/**
 * Masks the registered fields of a flat or nested record. Nested fields are
 * addressed with dot paths, e.g. `address.zip`.
 */
export function maskRecord<T extends Record<string, unknown>>({
  record,
  policy,
  scope,
  apply = true,
}: {
  record: T;
  policy: PiiPolicy;
  scope: PiiFieldScope;
  apply?: boolean;
}): { record: T; maskedFieldNames: string[] } {
  const maskedFieldNames: string[] = [];
  let result = record;
  const fields = fieldsFor(policy, scope);
  if (fields.size === 0) {
    return { record, maskedFieldNames };
  }

  for (const field of fields) {
    const path = field.split(".");
    const topLevel = path.length === 1;
    const hasValue = topLevel
      ? Object.prototype.hasOwnProperty.call(record, field)
      : hasNestedValue(record, path);
    if (!hasValue) {
      continue;
    }
    maskedFieldNames.push(field);
    if (!apply) {
      continue;
    }
    result = setPath(result, path, PII_MASKED);
  }

  return { record: result, maskedFieldNames };
}

export function maskJsonString({
  json,
  policy,
  scope,
  apply = true,
}: {
  json: string;
  policy: PiiPolicy;
  scope: PiiFieldScope;
  apply?: boolean;
}): { value: string; maskedFieldNames: string[] } {
  if (fieldsFor(policy, scope).size === 0) {
    return { value: json, maskedFieldNames: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { value: json, maskedFieldNames: [] };
  }
  if (!isRecord(parsed)) {
    return { value: json, maskedFieldNames: [] };
  }
  const { record, maskedFieldNames } = maskRecord({
    record: parsed,
    policy,
    scope,
    apply,
  });
  if (!apply || maskedFieldNames.length === 0) {
    return { value: json, maskedFieldNames };
  }
  return { value: JSON.stringify(record), maskedFieldNames };
}

export interface PiiUserPropertyValue {
  name: string;
  value: unknown;
  piiMasked?: boolean;
}

export function maskUserProperties({
  properties,
  policy,
  apply = true,
}: {
  properties: Record<string, PiiUserPropertyValue>;
  policy: PiiPolicy;
  apply?: boolean;
}): {
  properties: Record<string, PiiUserPropertyValue>;
  maskedFieldNames: string[];
} {
  const fields = fieldsFor(policy, PiiFieldScopeEnum.UserProperty);
  const maskedFieldNames: string[] = [];
  if (fields.size === 0) {
    return { properties, maskedFieldNames };
  }
  let result = properties;
  for (const [id, property] of Object.entries(properties)) {
    if (!fields.has(property.name.toLowerCase())) {
      continue;
    }
    maskedFieldNames.push(property.name);
    if (!apply) {
      continue;
    }
    if (result === properties) {
      result = { ...properties };
    }
    result[id] = {
      ...property,
      value: PII_MASKED,
      piiMasked: true,
    };
  }
  return { properties: result, maskedFieldNames };
}

export interface PiiEventItem {
  traits: string;
  context?: string;
  userId: string | null;
  anonymousId: string | null;
}

export function maskUserEvent<T extends PiiEventItem>({
  event,
  policy,
  apply = true,
}: {
  event: T;
  policy: PiiPolicy;
  apply?: boolean;
}): { event: T; maskedFieldNames: string[] } {
  const maskedFieldNames: string[] = [];
  let result = event;
  const update = (patch: Partial<PiiEventItem>) => {
    if (result === event) {
      result = { ...event };
    }
    Object.assign(result, patch);
  };

  const traits = maskJsonString({
    json: event.traits,
    policy,
    scope: PiiFieldScopeEnum.EventProperty,
    apply,
  });
  if (traits.maskedFieldNames.length) {
    maskedFieldNames.push(...traits.maskedFieldNames);
    if (traits.value !== event.traits) {
      update({ traits: traits.value });
    }
  }

  if (event.context) {
    const context = maskJsonString({
      json: event.context,
      policy,
      scope: PiiFieldScopeEnum.EventProperty,
      apply,
    });
    if (context.maskedFieldNames.length) {
      maskedFieldNames.push(...context.maskedFieldNames);
      if (context.value !== event.context) {
        update({ context: context.value });
      }
    }
  }

  const columns = fieldsFor(policy, PiiFieldScopeEnum.Column);
  if (event.userId !== null && columns.has("userevents.userid")) {
    maskedFieldNames.push("UserEvents.userId");
    if (apply) {
      update({ userId: PII_MASKED });
    }
  }
  if (event.anonymousId !== null && columns.has("userevents.anonymousid")) {
    maskedFieldNames.push("UserEvents.anonymousId");
    if (apply) {
      update({ anonymousId: PII_MASKED });
    }
  }

  return {
    event: result,
    maskedFieldNames: Array.from(new Set(maskedFieldNames)),
  };
}

/**
 * Copies an arbitrary object into a plain record without a type assertion, so
 * masking helpers can work on domain types that are not index signatures.
 */
function toRecord(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value));
}

export function maskDeliveryItem<T extends object>({
  item,
  policy,
  apply = true,
}: {
  item: T;
  policy: PiiPolicy;
  apply?: boolean;
}): { item: T; maskedFieldNames: string[] } {
  const { record, maskedFieldNames } = maskRecord({
    record: toRecord(item),
    policy,
    scope: PiiFieldScopeEnum.EventProperty,
    apply,
  });
  let result: T = apply ? { ...item, ...record } : item;
  const names = [...maskedFieldNames];
  const columns = fieldsFor(policy, PiiFieldScopeEnum.Column);

  if (columns.has("deliveries.to")) {
    names.push("Deliveries.to");
    if (apply) {
      result = { ...result, to: PII_MASKED };
    }
  }
  if (columns.has("deliveries.userid")) {
    names.push("Deliveries.userId");
    if (apply) {
      result = { ...result, userId: PII_MASKED };
    }
  }
  return { item: result, maskedFieldNames: names };
}

export async function getPiiFields({
  workspaceId,
  scope,
}: {
  workspaceId: string;
  scope?: PiiFieldScope;
}): Promise<
  {
    id: string;
    scope: PiiFieldScope;
    name: string;
    category: PiiCategory;
    createdAt: string;
    updatedAt: string;
  }[]
> {
  const rows = await db()
    .select()
    .from(dbPiiField)
    .where(
      scope
        ? and(
            eq(dbPiiField.workspaceId, workspaceId),
            eq(dbPiiField.scope, scope),
          )
        : eq(dbPiiField.workspaceId, workspaceId),
    )
    .orderBy(dbPiiField.scope, dbPiiField.name);

  return rows.map((row) => ({
    id: row.id,
    scope: row.scope,
    name: row.name,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createPiiFields({
  workspaceId,
  fields,
}: {
  workspaceId: string;
  fields: {
    scope: PiiFieldScope;
    name: string;
    category?: PiiCategory;
  }[];
}): Promise<void> {
  if (fields.length === 0) {
    return;
  }
  await db()
    .insert(dbPiiField)
    .values(
      fields.map((field) => ({
        workspaceId,
        scope: field.scope,
        name: field.name.trim(),
        category: field.category ?? "Other",
      })),
    )
    .onConflictDoNothing();
}

export async function updatePiiField({
  workspaceId,
  id,
  category,
}: {
  workspaceId: string;
  id: string;
  category?: PiiCategory;
}): Promise<boolean> {
  if (!category) {
    return false;
  }
  const result = await db()
    .update(dbPiiField)
    .set({ category })
    .where(and(eq(dbPiiField.workspaceId, workspaceId), eq(dbPiiField.id, id)));
  return (result.rowCount ?? 0) > 0;
}

const AUDIT_RESOURCE_ID_LIMIT = 100;

export async function recordPiiAccess({
  viewer,
  action,
  scope,
  fields,
  resourceIds,
  filter,
}: {
  viewer: PiiViewerContext;
  action: string;
  scope: PiiFieldScope;
  fields: Iterable<string>;
  resourceIds: Iterable<string>;
  filter?: Record<string, unknown>;
}): Promise<void> {
  if (!viewer.unmaskPii) {
    return;
  }
  const uniqueFields = Array.from(new Set(fields));
  if (uniqueFields.length === 0) {
    return;
  }
  const ids = Array.from(resourceIds);
  const rows = uniqueFields.map((fieldName) => ({
    workspaceId: viewer.workspaceId,
    workspaceMemberId: viewer.workspaceMemberId ?? null,
    action,
    scope,
    fieldName,
    resourceIds: ids.slice(0, AUDIT_RESOURCE_ID_LIMIT),
    recordCount: ids.length,
    filter: filter ?? null,
  }));
  try {
    await db().insert(dbPiiAccessAudit).values(rows);
  } catch (err) {
    logger().error({ err, action }, "failed to record PII access audit");
  }
}

export async function listPiiAccessAudit({
  workspaceId,
  limit = 50,
  cursor,
}: {
  workspaceId: string;
  limit?: number;
  cursor?: string;
}): Promise<{
  audits: PiiAccessAuditResource[];
  nextCursor?: string;
}> {
  const where = cursor
    ? and(
        eq(dbPiiAccessAudit.workspaceId, workspaceId),
        lt(dbPiiAccessAudit.createdAt, new Date(cursor)),
      )
    : eq(dbPiiAccessAudit.workspaceId, workspaceId);

  const rows = await db()
    .select()
    .from(dbPiiAccessAudit)
    .where(where)
    .orderBy(desc(dbPiiAccessAudit.createdAt))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    audits: page.map((row) => ({
      id: row.id,
      workspaceMemberId: row.workspaceMemberId ?? undefined,
      action: row.action,
      scope: row.scope,
      fieldName: row.fieldName,
      resourceIds: Array.isArray(row.resourceIds)
        ? row.resourceIds.map(String)
        : [],
      recordCount: row.recordCount,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor:
      rows.length > limit && last ? last.createdAt.toISOString() : undefined,
  };
}

export async function deletePiiFieldsByIds({
  workspaceId,
  ids,
}: {
  workspaceId: string;
  ids: string[];
}): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }
  const result = await db()
    .delete(dbPiiField)
    .where(
      and(eq(dbPiiField.workspaceId, workspaceId), inArray(dbPiiField.id, ids)),
    );
  return result.rowCount ?? 0;
}
