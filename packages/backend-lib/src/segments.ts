import { ValueError } from "@sinclair/typebox/errors";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import prisma from "./prisma";
import {
  EnrichedSegment,
  Segment,
  SegmentDefinition,
  SegmentResource,
} from "./types";

export function enrichSegment(
  segment: Segment
): Result<EnrichedSegment, ValueError[]> {
  const definitionResult = schemaValidate(
    segment.definition,
    SegmentDefinition
  );
  if (definitionResult.isErr()) {
    return err(definitionResult.error);
  }
  return ok({
    ...segment,
    definition: definitionResult.value,
  });
}

export async function createSegment({
  name,
  definition,
  workspaceId,
}: {
  name: string;
  workspaceId: string;
  definition: SegmentDefinition;
}) {
  await prisma.segment.create({
    data: {
      workspaceId,
      name,
      definition,
    },
  });
}

export function toSegmentResource(
  segment: Segment
): Result<SegmentResource, ValueError[]> {
  const result = enrichSegment(segment);
  if (result.isErr()) {
    return err(result.error);
  }
  const { id, name, workspaceId, definition } = result.value;
  return ok({
    id,
    name,
    workspaceId,
    definition,
  });
}

export async function findEnrichedSegment(
  segmentId: string
): Promise<Result<EnrichedSegment | null, ValueError[]>> {
  const segment = await prisma.segment.findFirst({ where: { id: segmentId } });
  if (!segment) {
    return ok(null);
  }

  return enrichSegment(segment);
}

export async function findAllEnrichedSegments(
  workspaceId: string
): Promise<Result<EnrichedSegment[], ValueError[]>> {
  const segments = await prisma.segment.findMany({
    where: { workspaceId },
  });

  const enrichedSegments: EnrichedSegment[] = [];
  for (const segment of segments) {
    const definitionResult = schemaValidate(
      segment.definition,
      SegmentDefinition
    );
    if (definitionResult.isErr()) {
      return err(definitionResult.error);
    }
    enrichedSegments.push({
      ...segment,
      definition: definitionResult.value,
    });
  }
  return ok(enrichedSegments);
}
