import logger from "../logger";
import { EventType, JSONValue } from "../types";
import type { InsertUserEvent } from "../userEvents";
import {
  doesJobAffectDependencies,
  getCachedRealtimeSegmentDependencies,
} from "./dependencies";
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
  let skippedAnonymousOnlyCount = 0;
  const jobs = userEvents.flatMap((event) => {
    const raw = parseMessageRaw(event.messageRaw);
    if (!raw?.type) {
      return [];
    }
    const messageId = event.messageId || raw.messageId;
    if (!messageId) {
      return [];
    }
    if (!raw.userId) {
      if (raw.anonymousId) {
        skippedAnonymousOnlyCount += 1;
      }
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
      workspaceId,
      messageId,
      userId: raw.userId,
      anonymousId: raw.anonymousId,
      userOrAnonymousId: raw.userId,
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
  if (skippedAnonymousOnlyCount > 0) {
    logger().debug(
      { workspaceId, skippedAnonymousOnlyCount },
      "Skipped anonymous-only realtime segment events.",
    );
  }
  return jobs;
}

export async function filterRealtimeSegmentEvalJobs({
  workspaceId,
  jobs,
}: {
  workspaceId: string;
  jobs: RealtimeSegmentEvalJob[];
}): Promise<RealtimeSegmentEvalJob[]> {
  if (jobs.length === 0) {
    return jobs;
  }

  const dependencies = await getCachedRealtimeSegmentDependencies({
    workspaceId,
  });
  return jobs.filter((job) => doesJobAffectDependencies({ job, dependencies }));
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
  const filteredJobs = await filterRealtimeSegmentEvalJobs({
    workspaceId,
    jobs,
  });
  if (filteredJobs.length === 0) {
    return;
  }
  await getRealtimeSegmentQueue().enqueue(filteredJobs);
}
