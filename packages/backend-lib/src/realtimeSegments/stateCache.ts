import { Counter } from "@opentelemetry/api";

import config from "../config";
import {
  DragonflyClient,
  DragonflyValue,
  getDragonflyClient,
} from "../dragonfly";
import { jsonValue } from "../jsonPath";
import logger from "../logger";
import { getMeter } from "../openTelemetry";
import { EventType, JSONValue } from "../types";
import { RealtimeSegmentDependencies } from "./dependencies";
import type { RealtimeUserState, RealtimeUserTrackEvent } from "./state";
import { RealtimeSegmentEvalJob } from "./types";

export type RedisValue = DragonflyValue;

interface CachedTrackEvent extends RealtimeUserTrackEvent {
  messageId: string;
}

export type RealtimeStateCacheClient = DragonflyClient;

const CACHE_KEY_PREFIX = "rt";
const CACHE_EVENT_RETENTION_BUFFER_SECONDS = 24 * 60 * 60;

let STATE_CACHE_CLIENT: RealtimeStateCacheClient | null = null;
let STATE_CACHE_OPERATION_COUNTER: Counter | null = null;

function stateCacheOperationCounter(): Counter {
  if (STATE_CACHE_OPERATION_COUNTER) {
    return STATE_CACHE_OPERATION_COUNTER;
  }
  STATE_CACHE_OPERATION_COUNTER = getMeter().createCounter(
    "realtime_segment_state_cache_operations",
    {
      description:
        "Realtime segment Dragonfly state cache operations by result",
      unit: "1",
    },
  );
  return STATE_CACHE_OPERATION_COUNTER;
}

function recordCacheOperation({
  operation,
  result,
}: {
  operation: "read" | "fill" | "write" | "prune";
  result: "hit" | "miss" | "success" | "error";
}): void {
  stateCacheOperationCounter().add(1, { operation, result });
}

function cacheConfig():
  | {
      enabled: true;
      ttlSeconds: number;
      maxEventsPerUserEvent: number;
      url: string;
    }
  | { enabled: false } {
  const backendConfig = config();
  if (
    !backendConfig.realtimeSegmentsStateCacheEnabled ||
    !backendConfig.realtimeSegmentsStateCacheUrl
  ) {
    return { enabled: false };
  }
  return {
    enabled: true,
    ttlSeconds: backendConfig.realtimeSegmentsStateCacheTtlSeconds,
    maxEventsPerUserEvent:
      backendConfig.realtimeSegmentsStateCacheMaxEventsPerUserEvent,
    url: backendConfig.realtimeSegmentsStateCacheUrl,
  };
}

function stateCacheClient(): RealtimeStateCacheClient | null {
  const backendConfig = cacheConfig();
  if (!backendConfig.enabled) {
    return null;
  }
  if (!STATE_CACHE_CLIENT) {
    STATE_CACHE_CLIENT = getDragonflyClient(backendConfig.url);
  }
  return STATE_CACHE_CLIENT;
}

export function setRealtimeStateCacheClientForTest(
  client: RealtimeStateCacheClient | null,
): void {
  STATE_CACHE_CLIENT?.close();
  STATE_CACHE_CLIENT = client;
}

export function closeRealtimeStateCacheClient(): void {
  STATE_CACHE_CLIENT?.close();
  STATE_CACHE_CLIENT = null;
}

function keyPart(value: string): string {
  return encodeURIComponent(value);
}

function userKey(workspaceId: string, userOrAnonymousId: string): string {
  return `${CACHE_KEY_PREFIX}:${keyPart(workspaceId)}:user:${keyPart(
    userOrAnonymousId,
  )}`;
}

function metaKey(workspaceId: string, userOrAnonymousId: string): string {
  return `${userKey(workspaceId, userOrAnonymousId)}:meta`;
}

function traitsKey(workspaceId: string, userOrAnonymousId: string): string {
  return `${userKey(workspaceId, userOrAnonymousId)}:traits`;
}

function eventKey({
  event,
  userOrAnonymousId,
  workspaceId,
}: {
  event: string;
  userOrAnonymousId: string;
  workspaceId: string;
}): string {
  return `${userKey(workspaceId, userOrAnonymousId)}:events:${keyPart(event)}`;
}

function eventDataKey({
  event,
  userOrAnonymousId,
  workspaceId,
}: {
  event: string;
  userOrAnonymousId: string;
  workspaceId: string;
}): string {
  return `${eventKey({ event, userOrAnonymousId, workspaceId })}:data`;
}

function asStringArray(value: RedisValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function hashResponseToRecord(value: RedisValue): Record<string, string> {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JSONValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }
  if (isRecord(value)) {
    return Object.values(value).every((item) => isJsonValue(item));
  }
  return false;
}

function asRecord(value: unknown): Record<string, JSONValue> {
  if (!isRecord(value)) {
    return {};
  }
  const record: Record<string, JSONValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isJsonValue(item)) {
      record[key] = item;
    }
  }
  return record;
}

function parseJsonValue(raw: string): JSONValue {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isJsonValue(parsed) ? parsed : raw;
  } catch {
    return raw;
  }
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

function isSubset(requested: Set<string>, cached: string[]): boolean {
  const cachedSet = new Set(cached);
  for (const item of requested) {
    if (!cachedSet.has(item)) {
      return false;
    }
  }
  return true;
}

function eventMinScore({
  dependencies,
  event,
  now,
}: {
  dependencies: RealtimeSegmentDependencies;
  event: string;
  now: Date;
}): string {
  const windowSeconds = dependencies.eventWindowSeconds.get(event);
  if (windowSeconds === undefined || windowSeconds === null) {
    return "-inf";
  }
  const minMs =
    now.getTime() -
    (windowSeconds + CACHE_EVENT_RETENTION_BUFFER_SECONDS) * 1000;
  return String(Math.max(minMs, 0));
}

function cachedEventId(event: CachedTrackEvent): string {
  return event.messageId;
}

function serializeEvent(event: CachedTrackEvent): string {
  return JSON.stringify({
    event: event.event,
    eventTime: event.eventTime.toISOString(),
    messageId: event.messageId,
    properties: event.properties,
  });
}

function deserializeEvent(raw: string): CachedTrackEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }
    if (
      typeof parsed.event !== "string" ||
      typeof parsed.eventTime !== "string" ||
      typeof parsed.messageId !== "string"
    ) {
      return null;
    }
    const eventTime = new Date(parsed.eventTime);
    if (Number.isNaN(eventTime.getTime())) {
      return null;
    }
    return {
      event: parsed.event,
      eventTime,
      messageId: parsed.messageId,
      properties: asRecord(parsed.properties),
    };
  } catch {
    return null;
  }
}

async function expireUserKeys({
  client,
  eventNames,
  ttlSeconds,
  userOrAnonymousId,
  workspaceId,
}: {
  client: RealtimeStateCacheClient;
  eventNames: Iterable<string>;
  ttlSeconds: number;
  userOrAnonymousId: string;
  workspaceId: string;
}): Promise<void> {
  await Promise.all([
    client.command([
      "EXPIRE",
      metaKey(workspaceId, userOrAnonymousId),
      String(ttlSeconds),
    ]),
    client.command([
      "EXPIRE",
      traitsKey(workspaceId, userOrAnonymousId),
      String(ttlSeconds),
    ]),
    ...[...eventNames].flatMap((event) => [
      client.command([
        "EXPIRE",
        eventKey({ event, userOrAnonymousId, workspaceId }),
        String(ttlSeconds),
      ]),
      client.command([
        "EXPIRE",
        eventDataKey({ event, userOrAnonymousId, workspaceId }),
        String(ttlSeconds),
      ]),
    ]),
  ]);
}

async function pruneEventCache({
  client,
  dependencies,
  event,
  maxEventsPerUserEvent,
  now,
  userOrAnonymousId,
  workspaceId,
}: {
  client: RealtimeStateCacheClient;
  dependencies: RealtimeSegmentDependencies;
  event: string;
  maxEventsPerUserEvent: number;
  now: Date;
  userOrAnonymousId: string;
  workspaceId: string;
}): Promise<void> {
  const zkey = eventKey({ event, userOrAnonymousId, workspaceId });
  const hkey = eventDataKey({ event, userOrAnonymousId, workspaceId });
  const minScore = eventMinScore({ dependencies, event, now });
  if (minScore !== "-inf") {
    const removedIds = asStringArray(
      await client.command(["ZRANGEBYSCORE", zkey, "-inf", `(${minScore}`]),
    );
    await client.command(["ZREMRANGEBYSCORE", zkey, "-inf", `(${minScore}`]);
    if (removedIds.length > 0) {
      await client.command(["HDEL", hkey, ...removedIds]);
    }
  }
  const count = await client.command(["ZCARD", zkey]);
  if (typeof count === "number" && count > maxEventsPerUserEvent) {
    const removedIds = asStringArray(
      await client.command([
        "ZRANGE",
        zkey,
        "0",
        String(count - maxEventsPerUserEvent - 1),
      ]),
    );
    await client.command([
      "ZREMRANGEBYRANK",
      zkey,
      "0",
      String(count - maxEventsPerUserEvent - 1),
    ]);
    if (removedIds.length > 0) {
      await client.command(["HDEL", hkey, ...removedIds]);
    }
  }
  recordCacheOperation({ operation: "prune", result: "success" });
}

export async function readCachedRealtimeUserState({
  dependencies,
  now = new Date(),
  userOrAnonymousId,
  workspaceId,
}: {
  dependencies: RealtimeSegmentDependencies;
  now?: Date;
  userOrAnonymousId: string;
  workspaceId: string;
}): Promise<RealtimeUserState | null> {
  const client = stateCacheClient();
  const backendConfig = cacheConfig();
  if (!client || !backendConfig.enabled) {
    return null;
  }

  try {
    const meta = hashResponseToRecord(
      await client.command([
        "HGETALL",
        metaKey(workspaceId, userOrAnonymousId),
      ]),
    );
    if (
      !isSubset(dependencies.traitPaths, parseJsonArray(meta.traitPaths)) ||
      !isSubset(dependencies.eventNames, parseJsonArray(meta.eventNames))
    ) {
      recordCacheOperation({ operation: "read", result: "miss" });
      return null;
    }

    const traitRows = hashResponseToRecord(
      await client.command([
        "HGETALL",
        traitsKey(workspaceId, userOrAnonymousId),
      ]),
    );
    const traits: Record<string, JSONValue> = {};
    for (const path of dependencies.traitPaths) {
      const value = traitRows[path];
      if (value !== undefined) {
        traits[path] = parseJsonValue(value);
      }
    }

    const trackEvents = (
      await Promise.all(
        [...dependencies.eventNames].map(async (event) => {
          const ids = asStringArray(
            await client.command([
              "ZREVRANGEBYSCORE",
              eventKey({ event, userOrAnonymousId, workspaceId }),
              "+inf",
              eventMinScore({ dependencies, event, now }),
              "LIMIT",
              "0",
              String(backendConfig.maxEventsPerUserEvent),
            ]),
          );
          if (ids.length === 0) {
            return [];
          }
          const rawEvents = asStringArray(
            await client.command([
              "HMGET",
              eventDataKey({ event, userOrAnonymousId, workspaceId }),
              ...ids,
            ]),
          );
          return rawEvents
            .map((raw) => deserializeEvent(raw))
            .filter((item): item is CachedTrackEvent => item !== null);
        }),
      )
    )
      .flat()
      .sort((a, b) => b.eventTime.getTime() - a.eventTime.getTime());

    recordCacheOperation({ operation: "read", result: "hit" });
    return {
      userOrAnonymousId,
      traits,
      trackEvents,
    };
  } catch (err) {
    logger().warn(
      { err, userOrAnonymousId, workspaceId },
      "Failed to read realtime segment state cache.",
    );
    recordCacheOperation({ operation: "read", result: "error" });
    return null;
  }
}

async function writeEvents({
  client,
  dependencies,
  events,
  userOrAnonymousId,
  workspaceId,
}: {
  client: RealtimeStateCacheClient;
  dependencies: RealtimeSegmentDependencies;
  events: CachedTrackEvent[];
  userOrAnonymousId: string;
  workspaceId: string;
}): Promise<void> {
  const backendConfig = cacheConfig();
  if (!backendConfig.enabled || events.length === 0) {
    return;
  }
  await Promise.all(
    events.map(async (event) => {
      const id = cachedEventId(event);
      await Promise.all([
        client.command([
          "ZADD",
          eventKey({ event: event.event, userOrAnonymousId, workspaceId }),
          String(event.eventTime.getTime()),
          id,
        ]),
        client.command([
          "HSET",
          eventDataKey({ event: event.event, userOrAnonymousId, workspaceId }),
          id,
          serializeEvent(event),
        ]),
      ]);
      await pruneEventCache({
        client,
        dependencies,
        event: event.event,
        maxEventsPerUserEvent: backendConfig.maxEventsPerUserEvent,
        now: new Date(),
        userOrAnonymousId,
        workspaceId,
      });
    }),
  );
}

export async function fillRealtimeUserStateCache({
  dependencies,
  state,
  workspaceId,
}: {
  dependencies: RealtimeSegmentDependencies;
  state: RealtimeUserState;
  workspaceId: string;
}): Promise<void> {
  const client = stateCacheClient();
  const backendConfig = cacheConfig();
  if (!client || !backendConfig.enabled) {
    return;
  }

  try {
    const existingMeta = hashResponseToRecord(
      await client.command([
        "HGETALL",
        metaKey(workspaceId, state.userOrAnonymousId),
      ]),
    );
    const traitPaths = [
      ...new Set([
        ...parseJsonArray(existingMeta.traitPaths),
        ...dependencies.traitPaths,
      ]),
    ];
    const eventNames = [
      ...new Set([
        ...parseJsonArray(existingMeta.eventNames),
        ...dependencies.eventNames,
      ]),
    ];
    const traitValues = [...dependencies.traitPaths].flatMap((path) =>
      state.traits[path] === undefined
        ? []
        : [path, JSON.stringify(state.traits[path])],
    );
    if (traitValues.length > 0) {
      await client.command([
        "HSET",
        traitsKey(workspaceId, state.userOrAnonymousId),
        ...traitValues,
      ]);
    }
    await client.command([
      "HSET",
      metaKey(workspaceId, state.userOrAnonymousId),
      "traitPaths",
      JSON.stringify(traitPaths),
      "eventNames",
      JSON.stringify(eventNames),
    ]);
    await writeEvents({
      client,
      dependencies,
      events: state.trackEvents
        .filter((event) => dependencies.eventNames.has(event.event))
        .map((event, index) => ({
          ...event,
          messageId:
            event.messageId ??
            `${event.event}:${event.eventTime.getTime()}:fill:${index}`,
        })),
      userOrAnonymousId: state.userOrAnonymousId,
      workspaceId,
    });
    await expireUserKeys({
      client,
      eventNames: dependencies.eventNames,
      ttlSeconds: backendConfig.ttlSeconds,
      userOrAnonymousId: state.userOrAnonymousId,
      workspaceId,
    });
    recordCacheOperation({ operation: "fill", result: "success" });
  } catch (err) {
    logger().warn(
      { err, userOrAnonymousId: state.userOrAnonymousId, workspaceId },
      "Failed to fill realtime segment state cache.",
    );
    recordCacheOperation({ operation: "fill", result: "error" });
  }
}

function readTraitPath({
  path,
  properties,
}: {
  path: string;
  properties: Record<string, JSONValue>;
}): { path: string; value: JSONValue } | null {
  const value = jsonValue({ data: properties, path });
  return value.isErr() ? null : { path, value: value.value };
}

export async function writeThroughRealtimeUserStateCache({
  dependencies,
  job,
  userOrAnonymousId,
  workspaceId,
}: {
  dependencies: RealtimeSegmentDependencies;
  job?: RealtimeSegmentEvalJob;
  userOrAnonymousId: string;
  workspaceId: string;
}): Promise<void> {
  const client = stateCacheClient();
  const backendConfig = cacheConfig();
  if (!client || !backendConfig.enabled || !job) {
    return;
  }

  try {
    if (job.eventType === String(EventType.Identify)) {
      const jobTraits = asRecord(job.payload.traits);
      const values = [...dependencies.traitPaths].flatMap((path) => {
        const trait = readTraitPath({ path, properties: jobTraits });
        return trait ? [trait.path, JSON.stringify(trait.value)] : [];
      });
      if (values.length > 0) {
        await client.command([
          "HSET",
          traitsKey(workspaceId, userOrAnonymousId),
          ...values,
        ]);
      }
    }

    if (
      job.event &&
      dependencies.eventNames.has(job.event) &&
      (job.eventType === String(EventType.Track) ||
        job.eventType === String(EventType.Page) ||
        job.eventType === String(EventType.Screen))
    ) {
      await writeEvents({
        client,
        dependencies,
        events: [
          {
            event: job.event,
            eventTime: job.eventTime,
            messageId: job.messageId,
            properties: asRecord(job.payload.properties),
          },
        ],
        userOrAnonymousId,
        workspaceId,
      });
    }

    await expireUserKeys({
      client,
      eventNames: dependencies.eventNames,
      ttlSeconds: backendConfig.ttlSeconds,
      userOrAnonymousId,
      workspaceId,
    });
    recordCacheOperation({ operation: "write", result: "success" });
  } catch (err) {
    logger().warn(
      { err, messageId: job.messageId, userOrAnonymousId, workspaceId },
      "Failed to write through realtime segment state cache.",
    );
    recordCacheOperation({ operation: "write", result: "error" });
  }
}
