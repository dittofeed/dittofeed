import { ValueError } from "@sinclair/typebox/errors";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";
import R from "remeda";

import prisma from "./prisma";
import {
  EnrichedSegment,
  InternalEventType,
  Prisma,
  Segment,
  SegmentDefinition,
  SegmentNode,
  SegmentNodeType,
  SegmentResource,
  UpsertSegmentResource,
} from "./types";
import logger from "./logger";

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
  await prisma().segment.create({
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
  const segment = await prisma().segment.findFirst({
    where: { id: segmentId },
  });
  if (!segment) {
    return ok(null);
  }

  return enrichSegment(segment);
}

export async function findAllEnrichedSegments(
  workspaceId: string
): Promise<Result<EnrichedSegment[], ValueError[]>> {
  const segments = await prisma().segment.findMany({
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

export async function upsertSegment(
  segment: UpsertSegmentResource
): Promise<SegmentResource> {
  const { id, workspaceId, name, definition } = segment;
  const query = Prisma.sql`
    INSERT INTO "Segment" ("id", "workspaceId", "name", "definition", "updatedAt")
    VALUES (${id}::uuid, ${workspaceId}::uuid, ${name}, ${definition}::jsonb, NOW())
    ON CONFLICT ("id")
    DO UPDATE SET
        "workspaceId" = excluded."workspaceId",
        "name" = COALESCE(excluded."name", "Segment"."name"),
        "definition" = COALESCE(excluded."definition", "Segment"."definition"),
        "updatedAt" = NOW()
    WHERE "Segment"."resourceType" <> 'Internal'
    RETURNING *`;
  const [result] = (await prisma().$queryRaw(query)) as [Segment];
  const updatedDefinition = result.definition as SegmentDefinition;

  return {
    id: result.id,
    workspaceId: result.workspaceId,
    name: result.name,
    definition: updatedDefinition,
  };
}

export function segmentNodeIsBroadcast(node: SegmentNode): boolean {
  return (
    node.type === SegmentNodeType.Broadcast ||
    (node.type === SegmentNodeType.Performed &&
      node.event === InternalEventType.SegmentBroadcast)
  );
}

export function segmentHasBroadcast(definition: SegmentDefinition): boolean {
  if (segmentNodeIsBroadcast(definition.entryNode)) {
    return true;
  }

  for (const node of definition.nodes) {
    if (segmentNodeIsBroadcast(node)) {
      return true;
    }
  }
  return false;
}
