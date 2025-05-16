import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import logger from "../../logger";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { SegmentDefinition, SegmentNodeType } from "isomorphic-lib/src/types";

export async function appendToManualSegment({
  workspaceId,
  segmentId,
  userIds,
}: {
  workspaceId: string;
  segmentId: string;
  userIds: string[];
}): Promise<boolean> {
  const segment = await db().query.segment.findFirst({
    where: and(
      eq(schema.segment.workspaceId, workspaceId),
      eq(schema.segment.id, segmentId),
    ),
  });
  if (!segment) {
    logger().info(
      {
        workspaceId,
        segmentId,
      },
      "Segment not found while appending to manual segment",
    );
    return false;
  }
  const definitionResult = schemaValidateWithErr(
    segment.definition,
    SegmentDefinition,
  );
  if (definitionResult.isErr()) {
    logger().error(
      {
        workspaceId,
        segmentId,
        err: definitionResult.error,
      },
      "Invalid segment definition while appending to manual segment",
    );
    return false;
  }

  const { entryNode } = definitionResult.value;
  if (entryNode.type !== SegmentNodeType.Manual) {
    logger().info(
      {
        workspaceId,
        segmentId,
      },
      "Manual segment definition does not contain a manual node",
    );
    return false;
  }
  return true;
}

export async function replaceManualSegment({
  workspaceId,
  segmentId,
  userIds,
}: {
  workspaceId: string;
  segmentId: string;
  userIds: string[];
}): Promise<boolean> {
  throw new Error("Not implemented");
}

export async function clearManualSegment({
  workspaceId,
  segmentId,
}: {
  workspaceId: string;
  segmentId: string;
}): Promise<boolean> {
  throw new Error("Not implemented");
}
