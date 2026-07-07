import { Counter } from "@opentelemetry/api";

import config from "../config";
import {
  DragonflyClient,
  DragonflyValue,
  getDragonflyClient,
} from "../dragonfly";
import logger from "../logger";
import { getMeter } from "../openTelemetry";

const CACHE_KEY_PREFIX = "cpa";
const USER_PROPERTY_TYPE = "user_property";
const SEGMENT_TYPE = "segment";
const NULL_SEGMENT_ASSIGNMENT = "__null__";

let ASSIGNMENT_CACHE_CLIENT: DragonflyClient | null = null;
let ASSIGNMENT_CACHE_OPERATION_COUNTER: Counter | null = null;

function assignmentCacheOperationCounter(): Counter {
  if (ASSIGNMENT_CACHE_OPERATION_COUNTER) {
    return ASSIGNMENT_CACHE_OPERATION_COUNTER;
  }
  ASSIGNMENT_CACHE_OPERATION_COUNTER = getMeter().createCounter(
    "computed_property_assignment_cache_operations",
    {
      description: "Computed property assignment Dragonfly cache operations",
      unit: "1",
    },
  );
  return ASSIGNMENT_CACHE_OPERATION_COUNTER;
}

function recordCacheOperation({
  operation,
  result,
  type,
}: {
  operation: "read" | "fill" | "write";
  result: "hit" | "miss" | "success" | "error";
  type: "user_property" | "segment";
}): void {
  assignmentCacheOperationCounter().add(1, { operation, result, type });
}

function cacheConfig():
  | {
      enabled: true;
      ttlSeconds: number;
      url: string;
    }
  | { enabled: false } {
  const backendConfig = config();
  if (
    !backendConfig.computedPropertyAssignmentsCacheEnabled ||
    !backendConfig.realtimeSegmentsStateCacheUrl
  ) {
    return { enabled: false };
  }
  return {
    enabled: true,
    ttlSeconds: backendConfig.computedPropertyAssignmentsCacheTtlSeconds,
    url: backendConfig.realtimeSegmentsStateCacheUrl,
  };
}

function assignmentCacheClient(): DragonflyClient | null {
  const backendConfig = cacheConfig();
  if (!backendConfig.enabled) {
    return null;
  }
  if (!ASSIGNMENT_CACHE_CLIENT) {
    ASSIGNMENT_CACHE_CLIENT = getDragonflyClient(backendConfig.url);
  }
  return ASSIGNMENT_CACHE_CLIENT;
}

export function setComputedPropertyAssignmentCacheClientForTest(
  client: DragonflyClient | null,
): void {
  ASSIGNMENT_CACHE_CLIENT?.close();
  ASSIGNMENT_CACHE_CLIENT = client;
}

function keyPart(value: string): string {
  return encodeURIComponent(value);
}

function assignmentKey({
  type,
  userId,
  workspaceId,
}: {
  type: typeof USER_PROPERTY_TYPE | typeof SEGMENT_TYPE;
  userId: string;
  workspaceId: string;
}): string {
  return `${CACHE_KEY_PREFIX}:${keyPart(workspaceId)}:user:${keyPart(
    userId,
  )}:${type}`;
}

function assignmentMetaKey({
  type,
  userId,
  workspaceId,
}: {
  type: typeof USER_PROPERTY_TYPE | typeof SEGMENT_TYPE;
  userId: string;
  workspaceId: string;
}): string {
  return `${assignmentKey({ type, userId, workspaceId })}:meta`;
}

function asStringArray(value: DragonflyValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asStringOrNullArray(value: DragonflyValue): (string | null)[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item : null))
    : [];
}

function hashResponseToRecord(value: DragonflyValue): Record<string, string> {
  const values = asStringArray(value);
  const record: Record<string, string> = {};
  for (let i = 0; i < values.length; i += 2) {
    const key = values[i];
    const item = values[i + 1];
    if (key !== undefined && item !== undefined) {
      record[key] = item;
    }
  }
  return record;
}

function parseJsonArray(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function isSubset(requestedIds: string[], cachedIds: string[]): boolean {
  const cached = new Set(cachedIds);
  return requestedIds.every((id) => cached.has(id));
}

function mergeIds(existingIds: string[], requestedIds: string[]): string[] {
  return [...new Set([...existingIds, ...requestedIds])];
}

async function readCachedIds({
  client,
  type,
  userId,
  workspaceId,
}: {
  client: DragonflyClient;
  type: typeof USER_PROPERTY_TYPE | typeof SEGMENT_TYPE;
  userId: string;
  workspaceId: string;
}): Promise<string[]> {
  const meta = hashResponseToRecord(
    await client.command([
      "HGETALL",
      assignmentMetaKey({ type, userId, workspaceId }),
    ]),
  );
  return parseJsonArray(meta.assignmentIds);
}

async function expireAssignmentKeys({
  client,
  ttlSeconds,
  type,
  userId,
  workspaceId,
}: {
  client: DragonflyClient;
  ttlSeconds: number;
  type: typeof USER_PROPERTY_TYPE | typeof SEGMENT_TYPE;
  userId: string;
  workspaceId: string;
}): Promise<void> {
  await Promise.all([
    client.command([
      "EXPIRE",
      assignmentKey({ type, userId, workspaceId }),
      String(ttlSeconds),
    ]),
    client.command([
      "EXPIRE",
      assignmentMetaKey({ type, userId, workspaceId }),
      String(ttlSeconds),
    ]),
  ]);
}

export async function readCachedUserPropertyAssignments({
  userId,
  userPropertyIds,
  workspaceId,
}: {
  userId: string;
  userPropertyIds: string[];
  workspaceId: string;
}): Promise<Map<string, string> | null> {
  const client = assignmentCacheClient();
  if (!client || userPropertyIds.length === 0) {
    return null;
  }
  try {
    const cachedIds = await readCachedIds({
      client,
      type: USER_PROPERTY_TYPE,
      userId,
      workspaceId,
    });
    if (!isSubset(userPropertyIds, cachedIds)) {
      recordCacheOperation({
        operation: "read",
        result: "miss",
        type: USER_PROPERTY_TYPE,
      });
      return null;
    }
    const values = asStringOrNullArray(
      await client.command([
        "HMGET",
        assignmentKey({ type: USER_PROPERTY_TYPE, userId, workspaceId }),
        ...userPropertyIds,
      ]),
    );
    const assignments = new Map<string, string>();
    userPropertyIds.forEach((id, index) => {
      const value = values[index];
      if (value !== null && value !== undefined) {
        assignments.set(id, value);
      }
    });
    recordCacheOperation({
      operation: "read",
      result: "hit",
      type: USER_PROPERTY_TYPE,
    });
    return assignments;
  } catch (err) {
    logger().warn(
      { err, userId, workspaceId },
      "Failed to read computed user property assignment cache.",
    );
    recordCacheOperation({
      operation: "read",
      result: "error",
      type: USER_PROPERTY_TYPE,
    });
    return null;
  }
}

export async function fillUserPropertyAssignmentsCache({
  assignments,
  userId,
  userPropertyIds,
  workspaceId,
}: {
  assignments: Map<string, string>;
  userId: string;
  userPropertyIds: string[];
  workspaceId: string;
}): Promise<void> {
  const client = assignmentCacheClient();
  const backendConfig = cacheConfig();
  if (!client || !backendConfig.enabled || userPropertyIds.length === 0) {
    return;
  }
  try {
    const existingIds = await readCachedIds({
      client,
      type: USER_PROPERTY_TYPE,
      userId,
      workspaceId,
    });
    const values = [...assignments.entries()].flatMap(([id, value]) =>
      userPropertyIds.includes(id) ? [id, value] : [],
    );
    if (values.length > 0) {
      await client.command([
        "HSET",
        assignmentKey({ type: USER_PROPERTY_TYPE, userId, workspaceId }),
        ...values,
      ]);
    }
    await client.command([
      "HSET",
      assignmentMetaKey({ type: USER_PROPERTY_TYPE, userId, workspaceId }),
      "assignmentIds",
      JSON.stringify(mergeIds(existingIds, userPropertyIds)),
    ]);
    await expireAssignmentKeys({
      client,
      ttlSeconds: backendConfig.ttlSeconds,
      type: USER_PROPERTY_TYPE,
      userId,
      workspaceId,
    });
    recordCacheOperation({
      operation: "fill",
      result: "success",
      type: USER_PROPERTY_TYPE,
    });
  } catch (err) {
    logger().warn(
      { err, userId, workspaceId },
      "Failed to fill computed user property assignment cache.",
    );
    recordCacheOperation({
      operation: "fill",
      result: "error",
      type: USER_PROPERTY_TYPE,
    });
  }
}

function serializeSegmentAssignment(value: boolean | null): string {
  if (value === null) {
    return NULL_SEGMENT_ASSIGNMENT;
  }
  return value ? "true" : "false";
}

function deserializeSegmentAssignment(value: string): boolean | null {
  if (value === NULL_SEGMENT_ASSIGNMENT) {
    return null;
  }
  return value === "true";
}

export async function readCachedSegmentAssignments({
  segmentIds,
  userId,
  workspaceId,
}: {
  segmentIds: string[];
  userId: string;
  workspaceId: string;
}): Promise<Map<string, boolean | null> | null> {
  const client = assignmentCacheClient();
  if (!client || segmentIds.length === 0) {
    return null;
  }
  try {
    const cachedIds = await readCachedIds({
      client,
      type: SEGMENT_TYPE,
      userId,
      workspaceId,
    });
    if (!isSubset(segmentIds, cachedIds)) {
      recordCacheOperation({
        operation: "read",
        result: "miss",
        type: SEGMENT_TYPE,
      });
      return null;
    }
    const values = asStringOrNullArray(
      await client.command([
        "HMGET",
        assignmentKey({ type: SEGMENT_TYPE, userId, workspaceId }),
        ...segmentIds,
      ]),
    );
    const assignments = new Map<string, boolean | null>();
    segmentIds.forEach((id, index) => {
      const value = values[index];
      assignments.set(
        id,
        value === null || value === undefined
          ? null
          : deserializeSegmentAssignment(value),
      );
    });
    recordCacheOperation({
      operation: "read",
      result: "hit",
      type: SEGMENT_TYPE,
    });
    return assignments;
  } catch (err) {
    logger().warn(
      { err, userId, workspaceId },
      "Failed to read computed segment assignment cache.",
    );
    recordCacheOperation({
      operation: "read",
      result: "error",
      type: SEGMENT_TYPE,
    });
    return null;
  }
}

export async function fillSegmentAssignmentsCache({
  assignments,
  segmentIds,
  userId,
  workspaceId,
}: {
  assignments: Map<string, boolean | null>;
  segmentIds: string[];
  userId: string;
  workspaceId: string;
}): Promise<void> {
  const client = assignmentCacheClient();
  const backendConfig = cacheConfig();
  if (!client || !backendConfig.enabled || segmentIds.length === 0) {
    return;
  }
  try {
    const existingIds = await readCachedIds({
      client,
      type: SEGMENT_TYPE,
      userId,
      workspaceId,
    });
    const values = segmentIds.flatMap((id) => [
      id,
      serializeSegmentAssignment(assignments.get(id) ?? null),
    ]);
    await client.command([
      "HSET",
      assignmentKey({ type: SEGMENT_TYPE, userId, workspaceId }),
      ...values,
    ]);
    await client.command([
      "HSET",
      assignmentMetaKey({ type: SEGMENT_TYPE, userId, workspaceId }),
      "assignmentIds",
      JSON.stringify(mergeIds(existingIds, segmentIds)),
    ]);
    await expireAssignmentKeys({
      client,
      ttlSeconds: backendConfig.ttlSeconds,
      type: SEGMENT_TYPE,
      userId,
      workspaceId,
    });
    recordCacheOperation({
      operation: "fill",
      result: "success",
      type: SEGMENT_TYPE,
    });
  } catch (err) {
    logger().warn(
      { err, userId, workspaceId },
      "Failed to fill computed segment assignment cache.",
    );
    recordCacheOperation({
      operation: "fill",
      result: "error",
      type: SEGMENT_TYPE,
    });
  }
}

export async function writeThroughSegmentAssignmentsCache(
  assignments: {
    inSegment: boolean;
    segmentId: string;
    userId: string;
    workspaceId: string;
  }[],
): Promise<void> {
  const client = assignmentCacheClient();
  const backendConfig = cacheConfig();
  if (!client || !backendConfig.enabled || assignments.length === 0) {
    return;
  }
  const byUser = new Map<
    string,
    {
      assignments: Map<string, boolean | null>;
      segmentIds: string[];
      userId: string;
      workspaceId: string;
    }
  >();
  for (const assignment of assignments) {
    const key = `${assignment.workspaceId}:${assignment.userId}`;
    const group =
      byUser.get(key) ??
      ({
        assignments: new Map<string, boolean | null>(),
        segmentIds: [],
        userId: assignment.userId,
        workspaceId: assignment.workspaceId,
      } satisfies {
        assignments: Map<string, boolean | null>;
        segmentIds: string[];
        userId: string;
        workspaceId: string;
      });
    group.assignments.set(assignment.segmentId, assignment.inSegment);
    group.segmentIds.push(assignment.segmentId);
    byUser.set(key, group);
  }
  try {
    await Promise.all(
      [...byUser.values()].map((group) =>
        fillSegmentAssignmentsCache({
          assignments: group.assignments,
          segmentIds: group.segmentIds,
          userId: group.userId,
          workspaceId: group.workspaceId,
        }),
      ),
    );
    recordCacheOperation({
      operation: "write",
      result: "success",
      type: SEGMENT_TYPE,
    });
  } catch (err) {
    logger().warn(
      { err },
      "Failed to write through computed segment assignment cache.",
    );
    recordCacheOperation({
      operation: "write",
      result: "error",
      type: SEGMENT_TYPE,
    });
  }
}

export async function writeThroughUserPropertyAssignmentsCache(
  assignments: {
    userId: string;
    userPropertyId: string;
    value: string;
    workspaceId: string;
  }[],
): Promise<void> {
  const client = assignmentCacheClient();
  const backendConfig = cacheConfig();
  if (!client || !backendConfig.enabled || assignments.length === 0) {
    return;
  }
  const byUser = new Map<
    string,
    {
      assignments: Map<string, string>;
      userId: string;
      userPropertyIds: string[];
      workspaceId: string;
    }
  >();
  for (const assignment of assignments) {
    const key = `${assignment.workspaceId}:${assignment.userId}`;
    const group =
      byUser.get(key) ??
      ({
        assignments: new Map<string, string>(),
        userId: assignment.userId,
        userPropertyIds: [],
        workspaceId: assignment.workspaceId,
      } satisfies {
        assignments: Map<string, string>;
        userId: string;
        userPropertyIds: string[];
        workspaceId: string;
      });
    group.assignments.set(assignment.userPropertyId, assignment.value);
    group.userPropertyIds.push(assignment.userPropertyId);
    byUser.set(key, group);
  }
  try {
    await Promise.all(
      [...byUser.values()].map((group) =>
        fillUserPropertyAssignmentsCache({
          assignments: group.assignments,
          userId: group.userId,
          userPropertyIds: group.userPropertyIds,
          workspaceId: group.workspaceId,
        }),
      ),
    );
    recordCacheOperation({
      operation: "write",
      result: "success",
      type: USER_PROPERTY_TYPE,
    });
  } catch (err) {
    logger().warn(
      { err },
      "Failed to write through computed user property assignment cache.",
    );
    recordCacheOperation({
      operation: "write",
      result: "error",
      type: USER_PROPERTY_TYPE,
    });
  }
}
