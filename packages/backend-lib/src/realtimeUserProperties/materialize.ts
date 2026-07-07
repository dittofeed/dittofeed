import { Counter, Histogram } from "@opentelemetry/api";
import { stableJsonStringify } from "isomorphic-lib/src/equality";
import { doesEventNameMatch } from "isomorphic-lib/src/events";
import { fileUserPropertyToPerformed } from "isomorphic-lib/src/userProperties";

import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  query as chQuery,
} from "../clickhouse";
import {
  readCachedUserPropertyAssignments,
  writeThroughUserPropertyAssignmentsCache,
} from "../computedProperties/assignmentCache";
import config from "../config";
import { jsonValue } from "../jsonPath";
import logger from "../logger";
import { getMeter } from "../openTelemetry";
import { RealtimeUserTrackEvent } from "../realtimeSegments/state";
import {
  EventType,
  GroupChildrenUserPropertyDefinitions,
  JSONValue,
  PerformedUserPropertyDefinition,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
} from "../types";
import {
  COMPUTED_PROPERTY_ASSIGNMENTS_CURRENT_TABLE,
  COMPUTED_PROPERTY_ASSIGNMENTS_TABLE,
} from "../userEvents/clickhouse";
import {
  doesJobAffectUserPropertyDependencies,
  getCachedRealtimeUserPropertyDependencies,
  RealtimeUserPropertyDependencies,
  RealtimeUserPropertyJob,
} from "./dependencies";

interface UserPropertyAssignmentRow {
  workspace_id: string;
  type: "user_property";
  computed_property_id: string;
  user_id: string;
  segment_value: false;
  user_property_value: string;
  max_event_time: string;
  assigned_at: string;
}

interface LatestAssignmentRow {
  computed_property_id: string;
  last_value: string;
  max_event_time: string;
}

let MATERIALIZER_COUNTER: Counter | null = null;
let MATERIALIZER_DURATION_HISTOGRAM: Histogram | null = null;
let MATERIALIZER_CLICKHOUSE_FALLBACK_COUNTER: Counter | null = null;

export interface RealtimeUserPropertyMaterializeResult {
  candidateCount: number;
  writtenCount: number;
}

function materializerCounter(): Counter {
  if (MATERIALIZER_COUNTER) {
    return MATERIALIZER_COUNTER;
  }
  MATERIALIZER_COUNTER = getMeter().createCounter(
    "realtime_user_property_materializer_runs",
    {
      description: "Realtime user property materializer outcomes",
      unit: "1",
    },
  );
  return MATERIALIZER_COUNTER;
}

function materializerDurationHistogram(): Histogram {
  if (MATERIALIZER_DURATION_HISTOGRAM) {
    return MATERIALIZER_DURATION_HISTOGRAM;
  }
  MATERIALIZER_DURATION_HISTOGRAM = getMeter().createHistogram(
    "realtime_user_property_materializer_duration_ms",
    {
      description: "Realtime user property materializer duration",
      unit: "ms",
    },
  );
  return MATERIALIZER_DURATION_HISTOGRAM;
}

function materializerClickHouseFallbackCounter(): Counter {
  if (MATERIALIZER_CLICKHOUSE_FALLBACK_COUNTER) {
    return MATERIALIZER_CLICKHOUSE_FALLBACK_COUNTER;
  }
  MATERIALIZER_CLICKHOUSE_FALLBACK_COUNTER = getMeter().createCounter(
    "realtime_user_property_materializer_clickhouse_fallbacks",
    {
      description:
        "ClickHouse fallback reads from realtime user property materializer",
      unit: "1",
    },
  );
  return MATERIALIZER_CLICKHOUSE_FALLBACK_COUNTER;
}

function recordMaterializerRun({
  durationMs,
  result,
}: {
  durationMs: number;
  result:
    | "disabled"
    | "unaffected"
    | "no_candidates"
    | "no_supported_candidates"
    | "success"
    | "error";
}): void {
  materializerCounter().add(1, { result });
  materializerDurationHistogram().record(durationMs, { result });
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

function readPath({
  data,
  path,
}: {
  data: Record<string, JSONValue>;
  path: string;
}): JSONValue | null {
  const value = jsonValue({ data, path });
  if (value.isErr() || value.value === null) {
    return null;
  }
  return value.value;
}

function matchesProperties({
  event,
  properties,
}: {
  event: RealtimeUserTrackEvent;
  properties?: PerformedUserPropertyDefinition["properties"];
}): boolean {
  if (!properties?.length) {
    return true;
  }
  return properties.every((property) => {
    const value = readPath({ data: event.properties, path: property.path });
    return String(value) === property.operator.value;
  });
}

function matchingPerformedEvents({
  eventName,
  events,
  properties,
}: {
  eventName: string;
  events: RealtimeUserTrackEvent[];
  properties?: PerformedUserPropertyDefinition["properties"];
}): RealtimeUserTrackEvent[] {
  return events
    .filter(
      (event) =>
        doesEventNameMatch({ pattern: eventName, event: event.event }) &&
        matchesProperties({ event, properties }),
    )
    .sort((a, b) => b.eventTime.getTime() - a.eventTime.getTime());
}

function serializeValue(value: JSONValue): string {
  return stableJsonStringify(value);
}

function formatPerformedManyTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19);
}

function evaluateDefinition({
  anonymousId,
  definition,
  events,
  traits,
  userId,
}: {
  anonymousId?: string;
  definition: UserPropertyDefinition | GroupChildrenUserPropertyDefinitions;
  events: RealtimeUserTrackEvent[];
  traits: Record<string, JSONValue>;
  userId: string;
}): JSONValue | null {
  switch (definition.type) {
    case UserPropertyDefinitionType.Id:
      return userId;
    case UserPropertyDefinitionType.AnonymousId:
      return anonymousId ?? null;
    case UserPropertyDefinitionType.Trait:
      return traits[definition.path] ?? null;
    case UserPropertyDefinitionType.Performed:
    case UserPropertyDefinitionType.KeyedPerformed: {
      if (
        definition.type === UserPropertyDefinitionType.Performed &&
        definition.skipReCompute
      ) {
        return null;
      }
      const event = matchingPerformedEvents({
        eventName: definition.event,
        events,
        properties: definition.properties,
      })[0];
      return event
        ? readPath({ data: event.properties, path: definition.path })
        : null;
    }
    case UserPropertyDefinitionType.File: {
      if (definition.skipReCompute) {
        return null;
      }
      const performed = fileUserPropertyToPerformed({
        userProperty: definition,
      });
      return evaluateDefinition({
        anonymousId,
        definition: performed,
        events,
        traits,
        userId,
      });
    }
    case UserPropertyDefinitionType.PerformedMany: {
      if (!config().realtimeUserPropertiesPerformedManyEnabled) {
        return null;
      }
      const eventNames = new Set(definition.or.map((event) => event.event));
      const value = events
        .filter((event) => eventNames.has(event.event))
        .sort((a, b) => b.eventTime.getTime() - a.eventTime.getTime())
        .map((event) => ({
          event: event.event,
          timestamp: formatPerformedManyTimestamp(event.eventTime),
          properties: stableJsonStringify(event.properties),
        }));
      return value.length > 0 ? value : null;
    }
    case UserPropertyDefinitionType.Group: {
      const entryNode = definition.nodes.find(
        (node) => node.id === definition.entry,
      );
      if (!entryNode || entryNode.type !== UserPropertyDefinitionType.AnyOf) {
        return null;
      }
      for (const childId of entryNode.children) {
        const child = definition.nodes.find((node) => node.id === childId);
        if (!child) {
          continue;
        }
        const value = evaluateDefinition({
          anonymousId,
          definition: child,
          events,
          traits,
          userId,
        });
        if (value !== null && value !== "") {
          return value;
        }
      }
      return null;
    }
    case UserPropertyDefinitionType.AnyOf:
      return null;
  }
}

function candidateIdsForJob({
  dependencies,
  job,
}: {
  dependencies: RealtimeUserPropertyDependencies;
  job: RealtimeUserPropertyJob;
}): Set<string> {
  const ids = new Set(dependencies.alwaysUserPropertyIds);
  if (job.eventType === String(EventType.Identify)) {
    const traits = asRecord(job.payload.traits);
    for (const path of Object.keys(traits)) {
      const userPropertyIds = dependencies.userPropertiesByTraitPath.get(path);
      if (userPropertyIds) {
        for (const id of userPropertyIds) {
          ids.add(id);
        }
      }
    }
  }
  if (job.event) {
    for (const [
      eventName,
      userPropertyIds,
    ] of dependencies.userPropertiesByEventName) {
      if (
        eventName === "*" ||
        doesEventNameMatch({ pattern: eventName, event: job.event })
      ) {
        for (const id of userPropertyIds) {
          ids.add(id);
        }
      }
    }
  }
  return ids;
}

function supportsRealtimeMaterialization({
  definition,
}: {
  definition: UserPropertyDefinition | GroupChildrenUserPropertyDefinitions;
}): boolean {
  switch (definition.type) {
    case UserPropertyDefinitionType.Trait:
      return true;
    case UserPropertyDefinitionType.Performed:
      return definition.skipReCompute !== true;
    case UserPropertyDefinitionType.KeyedPerformed:
      return true;
    case UserPropertyDefinitionType.File:
      return definition.skipReCompute !== true;
    case UserPropertyDefinitionType.PerformedMany:
      return config().realtimeUserPropertiesPerformedManyEnabled;
    case UserPropertyDefinitionType.Group:
      for (const node of definition.nodes) {
        if (
          node.type !== UserPropertyDefinitionType.AnyOf &&
          supportsRealtimeMaterialization({ definition: node })
        ) {
          return true;
        }
      }
      return false;
    case UserPropertyDefinitionType.Id:
    case UserPropertyDefinitionType.AnonymousId:
      return true;
    case UserPropertyDefinitionType.AnyOf:
      return false;
  }
}

async function readLatestAssignments({
  userId,
  userPropertyIds,
  workspaceId,
}: {
  userId: string;
  userPropertyIds: string[];
  workspaceId: string;
}): Promise<Map<string, { maxEventTime: Date | null; value: string }>> {
  const cachedAssignments = await readCachedUserPropertyAssignments({
    userId,
    userPropertyIds,
    workspaceId,
  });
  if (cachedAssignments) {
    return new Map(
      [...cachedAssignments.entries()].map(([id, value]) => [
        id,
        { maxEventTime: null, value },
      ]),
    );
  }
  if (!config().realtimeUserPropertiesClickHouseFallbackEnabled) {
    return new Map();
  }
  if (userPropertyIds.length === 0) {
    return new Map();
  }
  materializerClickHouseFallbackCounter().add(1);
  const qb = new ClickHouseQueryBuilder();
  const result = await chQuery({
    query: `
      SELECT
        computed_property_id,
        argMax(user_property_value, assigned_at) AS last_value,
        max(max_event_time) AS max_event_time
      FROM ${config().readComputedPropertyAssignmentsFromCurrent ? COMPUTED_PROPERTY_ASSIGNMENTS_CURRENT_TABLE : COMPUTED_PROPERTY_ASSIGNMENTS_TABLE}
      WHERE
        workspace_id = ${qb.addQueryValue(workspaceId, "String")}
        AND user_id = ${qb.addQueryValue(userId, "String")}
        AND type = 'user_property'
        AND computed_property_id IN ${qb.addQueryValue(userPropertyIds, "Array(String)")}
      GROUP BY computed_property_id
    `,
    query_params: qb.getQueries(),
  });
  const rows = await result.json<LatestAssignmentRow>();
  return new Map(
    rows.map((row) => [
      row.computed_property_id,
      {
        maxEventTime: row.max_event_time ? new Date(row.max_event_time) : null,
        value: row.last_value,
      },
    ]),
  );
}

function toAssignmentRow({
  assignedAt,
  job,
  userPropertyId,
  value,
}: {
  assignedAt: Date;
  job: RealtimeUserPropertyJob;
  userPropertyId: string;
  value: string;
}): UserPropertyAssignmentRow {
  return {
    workspace_id: job.workspaceId,
    type: "user_property",
    computed_property_id: userPropertyId,
    user_id: job.userOrAnonymousId,
    segment_value: false,
    user_property_value: value,
    max_event_time: job.eventTime.toISOString(),
    assigned_at: assignedAt.toISOString(),
  };
}

async function writeAssignments(
  rows: UserPropertyAssignmentRow[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const tables = [COMPUTED_PROPERTY_ASSIGNMENTS_TABLE];
  if (config().writeComputedPropertyAssignmentsCurrent) {
    tables.push(COMPUTED_PROPERTY_ASSIGNMENTS_CURRENT_TABLE);
  }
  await Promise.all(
    tables.map((table) =>
      clickhouseClient().insert({
        table: `${table} (workspace_id, type, computed_property_id, user_id, segment_value, user_property_value, max_event_time, assigned_at)`,
        values: rows,
        format: "JSONEachRow",
        clickhouse_settings: { wait_end_of_query: 1 },
      }),
    ),
  );
}

export async function materializeRealtimeUserProperties({
  job,
}: {
  job: RealtimeUserPropertyJob;
}): Promise<RealtimeUserPropertyMaterializeResult> {
  const startedAt = Date.now();
  const finish = (
    result:
      | "disabled"
      | "unaffected"
      | "no_candidates"
      | "no_supported_candidates"
      | "success",
    materializeResult: RealtimeUserPropertyMaterializeResult,
  ) => {
    recordMaterializerRun({
      durationMs: Date.now() - startedAt,
      result,
    });
    return materializeResult;
  };
  if (!config().realtimeUserPropertiesMaterializationEnabled) {
    return finish("disabled", { candidateCount: 0, writtenCount: 0 });
  }
  try {
    const dependencies = await getCachedRealtimeUserPropertyDependencies({
      workspaceId: job.workspaceId,
    });
    if (!doesJobAffectUserPropertyDependencies({ dependencies, job })) {
      return finish("unaffected", { candidateCount: 0, writtenCount: 0 });
    }
    const candidateIds = candidateIdsForJob({ dependencies, job });
    const candidates = dependencies.userProperties.filter((userProperty) =>
      candidateIds.has(userProperty.id),
    );
    if (candidates.length === 0) {
      return finish("no_candidates", { candidateCount: 0, writtenCount: 0 });
    }

    const realtimeCandidates = candidates.filter((candidate) =>
      supportsRealtimeMaterialization({ definition: candidate.definition }),
    );
    if (realtimeCandidates.length === 0) {
      return finish("no_supported_candidates", {
        candidateCount: candidates.length,
        writtenCount: 0,
      });
    }
    const traits =
      job.eventType === String(EventType.Identify)
        ? asRecord(job.payload.traits)
        : {};
    const trackEvents: RealtimeUserTrackEvent[] =
      job.event &&
      (job.eventType === String(EventType.Track) ||
        job.eventType === String(EventType.Page) ||
        job.eventType === String(EventType.Screen))
        ? [
            {
              event: job.event,
              eventTime: job.eventTime,
              messageId: job.messageId,
              properties: asRecord(job.payload.properties),
            },
          ]
        : [];
    const latestAssignments = await readLatestAssignments({
      userId: job.userOrAnonymousId,
      userPropertyIds: realtimeCandidates.map((candidate) => candidate.id),
      workspaceId: job.workspaceId,
    });
    const assignedAt = new Date();
    const rows: UserPropertyAssignmentRow[] = [];

    for (const candidate of realtimeCandidates) {
      const value = evaluateDefinition({
        anonymousId: job.anonymousId,
        definition: candidate.definition,
        events: trackEvents,
        traits,
        userId: job.userOrAnonymousId,
      });
      if (value === null || value === "") {
        continue;
      }
      const serialized = serializeValue(value);
      const current = latestAssignments.get(candidate.id);
      if (current?.maxEventTime && current.maxEventTime > job.eventTime) {
        continue;
      }
      if (current?.value === serialized) {
        continue;
      }
      rows.push(
        toAssignmentRow({
          assignedAt,
          job,
          userPropertyId: candidate.id,
          value: serialized,
        }),
      );
    }

    await writeAssignments(rows);
    await writeThroughUserPropertyAssignmentsCache(
      rows.map((row) => ({
        userId: row.user_id,
        userPropertyId: row.computed_property_id,
        value: row.user_property_value,
        workspaceId: row.workspace_id,
      })),
    );
    return finish("success", {
      candidateCount: realtimeCandidates.length,
      writtenCount: rows.length,
    });
  } catch (err) {
    recordMaterializerRun({
      durationMs: Date.now() - startedAt,
      result: "error",
    });
    logger().error(
      {
        err,
        userId: job.userOrAnonymousId,
        workspaceId: job.workspaceId,
      },
      "Failed to materialize realtime user property assignments.",
    );
    throw err;
  }
}
