import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";

import { findSegmentResources } from "../segments";
import {
  InternalEventType,
  SavedSegmentResource,
  SegmentNode,
  SegmentNodeType,
} from "../types";
import { RealtimeSegmentEvalJob } from "./types";

export interface RealtimeSegmentDependencies {
  traitPaths: Set<string>;
  eventNames: Set<string>;
  always: boolean;
}

function addEventDependency(
  dependencies: Pick<RealtimeSegmentDependencies, "eventNames">,
  event: string,
): void {
  dependencies.eventNames.add(event);
}

function collectNodeDependencies({
  node,
  dependencies,
}: {
  node: SegmentNode;
  dependencies: Pick<RealtimeSegmentDependencies, "eventNames" | "traitPaths">;
}): void {
  switch (node.type) {
    case SegmentNodeType.Trait:
    case SegmentNodeType.Includes:
    case SegmentNodeType.NotIncludes:
      dependencies.traitPaths.add(node.path);
      return;
    case SegmentNodeType.Performed:
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

export function doesJobAffectSegment({
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
