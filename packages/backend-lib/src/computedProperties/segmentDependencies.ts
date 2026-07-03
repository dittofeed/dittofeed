import logger from "../logger";
import { getSegmentDependencies } from "../realtimeSegments/dependencies";
import { findSegmentResources } from "../segments";
import { SavedSegmentResource } from "../types";

export function expandSegmentDependencies({
  segments,
  allSegmentsById,
}: {
  segments: SavedSegmentResource[];
  allSegmentsById: Map<string, SavedSegmentResource>;
}): SavedSegmentResource[] {
  const result = new Map<string, SavedSegmentResource>();
  const queue = [...segments];

  while (queue.length > 0) {
    const segment = queue.pop();
    if (!segment || result.has(segment.id)) {
      continue;
    }
    result.set(segment.id, segment);

    for (const referencedSegmentId of getSegmentDependencies(segment)
      .segments) {
      if (referencedSegmentId === segment.id) {
        logger().warn(
          { segmentId: segment.id, workspaceId: segment.workspaceId },
          "segment references itself, skipping self-reference",
        );
        continue;
      }
      const referencedSegment = allSegmentsById.get(referencedSegmentId);
      if (!referencedSegment) {
        logger().warn(
          {
            segmentId: segment.id,
            referencedSegmentId,
            workspaceId: segment.workspaceId,
          },
          "referenced segment not found, skipping dependency",
        );
        continue;
      }
      if (!result.has(referencedSegmentId)) {
        queue.push(referencedSegment);
      }
    }
  }

  return [...result.values()];
}

export function topologicalSortSegments(
  segments: SavedSegmentResource[],
): SavedSegmentResource[] {
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const visited = new Set<string>();
  const sorted: SavedSegmentResource[] = [];

  const visit = (segment: SavedSegmentResource, stack: Set<string>) => {
    if (visited.has(segment.id)) {
      return;
    }
    if (stack.has(segment.id)) {
      logger().error(
        { segmentId: segment.id, workspaceId: segment.workspaceId },
        "circular segment dependency detected",
      );
      return;
    }
    stack.add(segment.id);
    for (const referencedSegmentId of getSegmentDependencies(segment)
      .segments) {
      const referencedSegment = segmentById.get(referencedSegmentId);
      if (referencedSegment) {
        visit(referencedSegment, stack);
      }
    }
    stack.delete(segment.id);
    visited.add(segment.id);
    sorted.push(segment);
  };

  for (const segment of segments) {
    visit(segment, new Set());
  }

  return sorted;
}

export async function expandAndSortSegmentsForCompute({
  workspaceId,
  segments,
}: {
  workspaceId: string;
  segments: SavedSegmentResource[];
}): Promise<SavedSegmentResource[]> {
  if (segments.length === 0) {
    return segments;
  }

  const allSegments = await findSegmentResources({ workspaceId });
  const allSegmentsById = new Map(
    allSegments.map((segment) => [segment.id, segment]),
  );

  const expanded = expandSegmentDependencies({
    segments,
    allSegmentsById,
  });
  return topologicalSortSegments(expanded);
}

export function findDependentSegments({
  allSegments,
  changedSegmentIds,
}: {
  allSegments: SavedSegmentResource[];
  changedSegmentIds: Set<string>;
}): SavedSegmentResource[] {
  return allSegments.filter((segment) => {
    if (changedSegmentIds.has(segment.id)) {
      return false;
    }
    return [...getSegmentDependencies(segment).segments].some((segmentId) =>
      changedSegmentIds.has(segmentId),
    );
  });
}
