import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";

import { findSegmentResources } from "../segments";
import {
  InternalEventType,
  SavedSegmentResource,
  SegmentNode,
  SegmentNodeType,
  TimeOperator,
} from "../types";
import { RealtimeSegmentEvalJob } from "./types";

export interface RealtimeSegmentDependencies {
  traitPaths: Set<string>;
  eventNames: Set<string>;
  eventWindowSeconds: Map<string, number | null>;
  always: boolean;
}

const REALTIME_SEGMENT_DEPENDENCY_CACHE_MAX_SIZE = 1_000;
const REALTIME_SEGMENT_DEPENDENCY_CACHE_TTL_MS = 30_000;

interface CachedRealtimeSegmentDependencies {
  dependencies: RealtimeSegmentDependencies;
  expiresAt: number;
}

const REALTIME_SEGMENT_DEPENDENCY_CACHE = new Map<
  string,
  CachedRealtimeSegmentDependencies
>();

function addEventDependency(
  dependencies: Pick<
    RealtimeSegmentDependencies,
    "eventNames" | "eventWindowSeconds"
  >,
  event: string,
  windowSeconds: number | null = null,
): void {
  dependencies.eventNames.add(event);
  const currentWindowSeconds = dependencies.eventWindowSeconds.get(event);
  if (currentWindowSeconds === null) {
    return;
  }
  if (windowSeconds === null || currentWindowSeconds === undefined) {
    dependencies.eventWindowSeconds.set(event, windowSeconds);
    return;
  }
  dependencies.eventWindowSeconds.set(
    event,
    Math.max(currentWindowSeconds, windowSeconds),
  );
}

function performedWindowSeconds(node: SegmentNode): number | null {
  if (node.type !== SegmentNodeType.Performed) {
    return null;
  }
  if (node.timeOperator && node.timeOperator !== TimeOperator.Within) {
    return null;
  }
  return node.withinSeconds ?? null;
}

function collectNodeDependencies({
  node,
  dependencies,
}: {
  node: SegmentNode;
  dependencies: Pick<
    RealtimeSegmentDependencies,
    "eventNames" | "eventWindowSeconds" | "traitPaths"
  >;
}): void {
  switch (node.type) {
    case SegmentNodeType.Trait:
    case SegmentNodeType.Includes:
    case SegmentNodeType.NotIncludes:
      dependencies.traitPaths.add(node.path);
      return;
    case SegmentNodeType.Performed:
      addEventDependency(
        dependencies,
        node.event,
        performedWindowSeconds(node),
      );
      return;
    case SegmentNodeType.LastPerformed:
    case SegmentNodeType.KeyedPerformed:
      addEventDependency(dependencies, node.event);
      return;
    case SegmentNodeType.Email:
      addEventDependency(dependencies, node.event);
      return;
    case SegmentNodeType.Broadcast:
      addEventDependency(dependencies, InternalEventType.SegmentBroadcast);
      return;
    case SegmentNodeType.SubscriptionGroup:
    case SegmentNodeType.SubscriptionGroupUnsubscribed:
      addEventDependency(dependencies, InternalEventType.SubscriptionChange);
      return;
    case SegmentNodeType.Manual:
      addEventDependency(dependencies, InternalEventType.ManualSegmentUpdate);
      return;
    case SegmentNodeType.Everyone:
    case SegmentNodeType.RandomBucket:
      return;
    case SegmentNodeType.And:
    case SegmentNodeType.Or:
      return;
    default:
      assertUnreachable(node);
  }
}

function hasAlwaysDependency(node: SegmentNode): boolean {
  switch (node.type) {
    case SegmentNodeType.Everyone:
    case SegmentNodeType.RandomBucket:
      return true;
    case SegmentNodeType.Trait:
    case SegmentNodeType.Includes:
    case SegmentNodeType.NotIncludes:
    case SegmentNodeType.Performed:
    case SegmentNodeType.LastPerformed:
    case SegmentNodeType.KeyedPerformed:
    case SegmentNodeType.Email:
    case SegmentNodeType.Broadcast:
    case SegmentNodeType.SubscriptionGroup:
    case SegmentNodeType.SubscriptionGroupUnsubscribed:
    case SegmentNodeType.Manual:
    case SegmentNodeType.And:
    case SegmentNodeType.Or:
      return false;
    default:
      assertUnreachable(node);
  }
}

function collectSegmentNodes(segment: SavedSegmentResource): SegmentNode[] {
  return [segment.definition.entryNode, ...segment.definition.nodes];
}

function hasAlwaysSegmentDependency(segment: SavedSegmentResource): boolean {
  return collectSegmentNodes(segment).some((node) => hasAlwaysDependency(node));
}

function collectDependencies(
  segment: SavedSegmentResource,
): Omit<RealtimeSegmentDependencies, "always"> {
  const dependencies: Omit<RealtimeSegmentDependencies, "always"> = {
    traitPaths: new Set(),
    eventNames: new Set(),
    eventWindowSeconds: new Map(),
  };
  for (const node of collectSegmentNodes(segment)) {
    collectNodeDependencies({ node, dependencies });
  }
  return dependencies;
}

export function getSegmentDependencies(
  segment: SavedSegmentResource,
): RealtimeSegmentDependencies {
  const dependencies = collectDependencies(segment);
  return {
    ...dependencies,
    always: hasAlwaysSegmentDependency(segment),
  };
}

export function mergeRealtimeSegmentDependencies(
  segments: SavedSegmentResource[],
): RealtimeSegmentDependencies {
  const dependencies: RealtimeSegmentDependencies = {
    traitPaths: new Set(),
    eventNames: new Set(),
    eventWindowSeconds: new Map(),
    always: false,
  };

  for (const segment of segments) {
    const segmentDependencies = getSegmentDependencies(segment);
    for (const path of segmentDependencies.traitPaths) {
      dependencies.traitPaths.add(path);
    }
    for (const event of segmentDependencies.eventNames) {
      dependencies.eventNames.add(event);
    }
    for (const [
      event,
      windowSeconds,
    ] of segmentDependencies.eventWindowSeconds) {
      const currentWindowSeconds = dependencies.eventWindowSeconds.get(event);
      if (currentWindowSeconds === null) {
        continue;
      }
      if (windowSeconds === null || currentWindowSeconds === undefined) {
        dependencies.eventWindowSeconds.set(event, windowSeconds);
        continue;
      }
      dependencies.eventWindowSeconds.set(
        event,
        Math.max(currentWindowSeconds, windowSeconds),
      );
    }
    dependencies.always ||= segmentDependencies.always;
  }

  return dependencies;
}

function setCachedRealtimeSegmentDependencies({
  workspaceId,
  dependencies,
}: {
  workspaceId: string;
  dependencies: RealtimeSegmentDependencies;
}): void {
  if (REALTIME_SEGMENT_DEPENDENCY_CACHE.has(workspaceId)) {
    REALTIME_SEGMENT_DEPENDENCY_CACHE.delete(workspaceId);
  } else if (
    REALTIME_SEGMENT_DEPENDENCY_CACHE.size >=
    REALTIME_SEGMENT_DEPENDENCY_CACHE_MAX_SIZE
  ) {
    const lruKey = REALTIME_SEGMENT_DEPENDENCY_CACHE.keys().next().value;
    if (lruKey) {
      REALTIME_SEGMENT_DEPENDENCY_CACHE.delete(lruKey);
    }
  }

  REALTIME_SEGMENT_DEPENDENCY_CACHE.set(workspaceId, {
    dependencies,
    expiresAt: Date.now() + REALTIME_SEGMENT_DEPENDENCY_CACHE_TTL_MS,
  });
}

export function clearRealtimeSegmentDependencyCache(): void {
  REALTIME_SEGMENT_DEPENDENCY_CACHE.clear();
}

export async function getCachedRealtimeSegmentDependencies({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<RealtimeSegmentDependencies> {
  const cached = REALTIME_SEGMENT_DEPENDENCY_CACHE.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) {
    REALTIME_SEGMENT_DEPENDENCY_CACHE.delete(workspaceId);
    REALTIME_SEGMENT_DEPENDENCY_CACHE.set(workspaceId, cached);
    return cached.dependencies;
  }
  if (cached) {
    REALTIME_SEGMENT_DEPENDENCY_CACHE.delete(workspaceId);
  }

  const segments = await findSegmentResources({ workspaceId });
  const dependencies = mergeRealtimeSegmentDependencies(segments);
  setCachedRealtimeSegmentDependencies({ workspaceId, dependencies });
  return dependencies;
}

export function doesJobAffectDependencies({
  job,
  dependencies,
}: {
  job: RealtimeSegmentEvalJob;
  dependencies: RealtimeSegmentDependencies;
}): boolean {
  if (dependencies.always) {
    return true;
  }
  if (job.event && dependencies.eventNames.has(job.event)) {
    return true;
  }
  return job.traitPaths.some((path) => dependencies.traitPaths.has(path));
}

export function doesJobAffectSegment({
  job,
  dependencies,
}: {
  job: RealtimeSegmentEvalJob;
  dependencies: RealtimeSegmentDependencies;
}): boolean {
  return doesJobAffectDependencies({ job, dependencies });
}

export async function findRealtimeSegmentCandidates({
  workspaceId,
  job,
}: {
  workspaceId: string;
  job: RealtimeSegmentEvalJob;
}): Promise<SavedSegmentResource[]> {
  const segments = await findSegmentResources({ workspaceId });
  return segments.filter((segment) =>
    doesJobAffectSegment({
      job,
      dependencies: getSegmentDependencies(segment),
    }),
  );
}
