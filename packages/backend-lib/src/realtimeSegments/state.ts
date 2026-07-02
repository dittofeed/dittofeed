/* eslint-disable @typescript-eslint/consistent-type-assertions */

import { ClickHouseQueryBuilder, query as chQuery } from "../clickhouse";
import { jsonValue } from "../jsonPath";
import { EventType, JSONValue } from "../types";
import {
  IDENTIFY_EVENTS_TABLE,
  TRACK_EVENTS_TABLE,
} from "../userEvents/clickhouse";
import { RealtimeSegmentDependencies } from "./dependencies";
import { RealtimeSegmentEvalJob } from "./types";

interface IdentifyRow {
  properties: string;
}

interface TrackRow {
  event: string;
  properties: string;
  event_time: string;
}

export interface RealtimeUserTrackEvent {
  event: string;
  properties: Record<string, JSONValue>;
  eventTime: Date;
}

export interface RealtimeUserState {
  userOrAnonymousId: string;
  traits: Record<string, JSONValue>;
  trackEvents: RealtimeUserTrackEvent[];
}

function parseProperties(raw: string): Record<string, JSONValue> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, JSONValue>;
}

function asRecord(value: unknown): Record<string, JSONValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, JSONValue>;
}

function readTraitPath({
  path,
  properties,
}: {
  path: string;
  properties: Record<string, JSONValue>;
}): { path: string; value: JSONValue } | null {
  const value = jsonValue({ data: properties, path });
  if (value.isErr()) {
    return null;
  }
  return { path, value: value.value };
}

function applyIdentifyJobTraits({
  traits,
  dependencies,
  job,
}: {
  traits: Record<string, JSONValue>;
  dependencies: RealtimeSegmentDependencies;
  job?: RealtimeSegmentEvalJob;
}): Record<string, JSONValue> {
  if (job?.eventType !== String(EventType.Identify)) {
    return traits;
  }

  const jobTraits = asRecord(job.payload.traits);
  const nextTraits = { ...traits };
  for (const path of dependencies.traitPaths) {
    const trait = readTraitPath({ path, properties: jobTraits });
    if (trait) {
      nextTraits[trait.path] = trait.value;
    }
  }
  return nextTraits;
}

function currentJobTrackEvent(
  job?: RealtimeSegmentEvalJob,
): RealtimeUserTrackEvent | null {
  if (
    !job?.event ||
    (job.eventType !== String(EventType.Track) &&
      job.eventType !== String(EventType.Page) &&
      job.eventType !== String(EventType.Screen))
  ) {
    return null;
  }

  return {
    event: job.event,
    properties: asRecord(job.payload.properties),
    eventTime: job.eventTime,
  };
}

async function readIdentifyTraits({
  workspaceId,
  userOrAnonymousId,
  dependencies,
}: {
  workspaceId: string;
  userOrAnonymousId: string;
  dependencies: RealtimeSegmentDependencies;
}): Promise<Record<string, JSONValue>> {
  if (dependencies.traitPaths.size === 0) {
    return {};
  }

  const qb = new ClickHouseQueryBuilder();
  const result = await chQuery({
    query: `
      SELECT properties
      FROM (
        SELECT properties, event_time, processing_time
        FROM ${IDENTIFY_EVENTS_TABLE}
        WHERE
          workspace_id = ${qb.addQueryValue(workspaceId, "String")}
          AND user_or_anonymous_id = ${qb.addQueryValue(userOrAnonymousId, "String")}
        ORDER BY event_time DESC, processing_time DESC
        LIMIT 500
      )
      ORDER BY event_time ASC, processing_time ASC
    `,
    query_params: qb.getQueries(),
  });
  const rows = await result.json<IdentifyRow>();
  const traits: Record<string, JSONValue> = {};

  for (const row of rows) {
    const properties = parseProperties(row.properties);
    for (const path of dependencies.traitPaths) {
      const trait = readTraitPath({ path, properties });
      if (trait) {
        traits[trait.path] = trait.value;
      }
    }
  }

  return traits;
}

async function readTrackEvents({
  workspaceId,
  userOrAnonymousId,
  dependencies,
}: {
  workspaceId: string;
  userOrAnonymousId: string;
  dependencies: RealtimeSegmentDependencies;
}): Promise<RealtimeUserTrackEvent[]> {
  if (dependencies.eventNames.size === 0) {
    return [];
  }

  const qb = new ClickHouseQueryBuilder();
  const eventNames = [...dependencies.eventNames];
  const result = await chQuery({
    query: `
      SELECT event, properties, event_time
      FROM ${TRACK_EVENTS_TABLE}
      WHERE
        workspace_id = ${qb.addQueryValue(workspaceId, "String")}
        AND user_or_anonymous_id = ${qb.addQueryValue(userOrAnonymousId, "String")}
        AND event IN ${qb.addQueryValue(eventNames, "Array(String)")}
      ORDER BY event_time DESC, processing_time DESC
      LIMIT 5000
    `,
    query_params: qb.getQueries(),
  });
  const rows = await result.json<TrackRow>();
  return rows.map((row) => ({
    event: row.event,
    properties: parseProperties(row.properties),
    eventTime: new Date(row.event_time),
  }));
}

export async function readRealtimeUserState({
  workspaceId,
  userOrAnonymousId,
  dependencies,
  currentJob,
}: {
  workspaceId: string;
  userOrAnonymousId: string;
  dependencies: RealtimeSegmentDependencies;
  currentJob?: RealtimeSegmentEvalJob;
}): Promise<RealtimeUserState> {
  const [traits, trackEvents] = await Promise.all([
    readIdentifyTraits({ workspaceId, userOrAnonymousId, dependencies }),
    readTrackEvents({ workspaceId, userOrAnonymousId, dependencies }),
  ]);
  const jobTrackEvent = currentJobTrackEvent(currentJob);

  return {
    userOrAnonymousId,
    traits: applyIdentifyJobTraits({
      traits,
      dependencies,
      job: currentJob,
    }),
    trackEvents: jobTrackEvent ? [jobTrackEvent, ...trackEvents] : trackEvents,
  };
}
