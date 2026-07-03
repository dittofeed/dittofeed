import { randomUUID } from "crypto";
import { SavedSegmentResource } from "isomorphic-lib/src/types";

import logger from "../logger";
import { findSegmentResources } from "../segments";
import { EventType, JSONValue } from "../types";
import type { InsertUserEvent } from "../userEvents";
import { getSegmentDependencies } from "./dependencies";
import { getRealtimeSegmentQueue } from "./queue";
import { RealtimeSegmentEvalJob } from "./types";

/* eslint-disable @typescript-eslint/consistent-type-assertions */

interface RawUserEvent {
  type?: EventType;
  userId?: string;
  anonymousId?: string;
  messageId?: string;
  event?: string;
  timestamp?: string;
  traits?: Record<string, JSONValue>;
  properties?: Record<string, JSONValue>;
}

function asRecord(value: unknown): Record<string, JSONValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, JSONValue>;
}

function parseMessageRaw(
  messageRaw: InsertUserEvent["messageRaw"],
): RawUserEvent | null {
  if (typeof messageRaw !== "string") {
    return messageRaw as RawUserEvent;
  }
  try {
    return JSON.parse(messageRaw) as RawUserEvent;
  } catch (err) {
    logger().warn({ err }, "Unable to parse realtime segment event payload.");
    return null;
  }
}

function parseTimestamp(timestamp: string | undefined, fallback: Date): Date {
  if (!timestamp) {
    return fallback;
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed;
}

export function buildRealtimeSegmentEvalJobs({
  workspaceId,
  userEvents,
}: {
  workspaceId: string;
  userEvents: InsertUserEvent[];
}): RealtimeSegmentEvalJob[] {
  const now = new Date();
  return userEvents.flatMap((event) => {
    const raw = parseMessageRaw(event.messageRaw);
    if (!raw?.type) {
      return [];
    }
    const messageId = event.messageId || raw.messageId;
    if (!messageId) {
      return [];
    }
    const userOrAnonymousId = raw.userId ?? raw.anonymousId;
    if (!userOrAnonymousId) {
      return [];
    }

    const traits = raw.type === EventType.Identify ? asRecord(raw.traits) : {};
    const properties =
      raw.type === EventType.Track ||
      raw.type === EventType.Page ||
      raw.type === EventType.Screen
        ? asRecord(raw.properties)
        : {};

    return {
      type: "eventReceived",
      workspaceId,
      messageId,
      userId: raw.userId,
      anonymousId: raw.anonymousId,
      userOrAnonymousId,
      eventType: raw.type,
      event: typeof raw.event === "string" ? raw.event : undefined,
      traitPaths: Object.keys(traits),
      propertyPaths: Object.keys(properties),
      payload: raw as Record<string, JSONValue>,
      eventTime: parseTimestamp(raw.timestamp, now),
      processingTime: event.processingTime
        ? parseTimestamp(event.processingTime, now)
        : now,
    };
  });
}

export function buildRealtimeSegmentEvalJobBySegment({
  workspaceId,
  segment,
  userId,
}: {
  workspaceId: string;
  segment: SavedSegmentResource;
  userId: string;
}): RealtimeSegmentEvalJob {
  const now = new Date();

  return {
    type: "segmentChange",
    workspaceId,
    messageId: randomUUID(),
    userId,
    userOrAnonymousId: userId,
    payload: {},
    eventTime: now,
    processingTime: now,
    segment: segment.id,
  };
}

export async function enqueueRealtimeSegmentEvalJobs({
  workspaceId,
  userEvents,
}: {
  workspaceId: string;
  userEvents: InsertUserEvent[];
}): Promise<void> {
  const jobs = buildRealtimeSegmentEvalJobs({ workspaceId, userEvents });
  if (jobs.length === 0) {
    return;
  }
  await getRealtimeSegmentQueue().enqueue(jobs);
}

export async function enqueueRealtimeSegmentEvalBySegmentJobs({
  workspaceId,
  segmentIds,
  userId,
}: {
  workspaceId: string;
  segmentIds: Set<string>;
  userId: string;
}): Promise<void> {
  const segments = await findSegmentResources({ workspaceId });

  const jobs = segments.flatMap((segment) => {
    const dependencies = getSegmentDependencies(segment);

    if (
      ![...dependencies.segments].some((segmentId) => segmentIds.has(segmentId))
    ) {
      return [];
    }

    return buildRealtimeSegmentEvalJobBySegment({
      segment,
      userId,
      workspaceId,
    });
  });

  await getRealtimeSegmentQueue().enqueue(jobs);
}
