import { and, eq } from "drizzle-orm";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  BatchItem,
  EventType,
  InternalEventType,
  ManualSegmentNode,
  SegmentDefinition,
  SegmentNodeType,
} from "isomorphic-lib/src/types";
import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "../../apps/batch";
import { computePropertiesIncremental } from "../../computedProperties/computePropertiesWorkflow/activities";
import { db } from "../../db";
import * as schema from "../../db/schema";
import logger from "../../logger";
import { toSegmentResource } from "../../segments";

export async function appendToManualSegment({
  workspaceId,
  segmentId,
  userIds,
  now,
}: {
  workspaceId: string;
  segmentId: string;
  userIds: string[];
  now: number;
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
  const batch: BatchItem[] = userIds.flatMap((userId) => {
    return [
      {
        type: EventType.Track,
        userId,
        timestamp: new Date(now).toISOString(),
        event: InternalEventType.ManualSegmentUpdate,
        properties: {
          segmentId,
          version: entryNode.version,
          inSegment: 1,
        },
        messageId: uuidv5(
          `manual-update-${segmentId}-${entryNode.version}-${userId}`,
          workspaceId,
        ),
      },
    ];
  });
  await submitBatch(
    {
      workspaceId,
      data: {
        batch,
      },
    },
    {
      processingTime: now,
    },
  );
  const segmentResource = toSegmentResource(segment);
  if (segmentResource.isErr()) {
    logger().error(
      { err: segmentResource.error, workspaceId, segmentId },
      "Failed to convert segment to resource",
    );
    return false;
  }
  await computePropertiesIncremental({
    workspaceId,
    segments: [segmentResource.value],
    userProperties: [],
    journeys: [],
    integrations: [],
    now,
  });

  return await db().transaction(async (tx) => {
    const segmentPostCalc = await tx.query.segment.findFirst({
      where: and(
        eq(schema.segment.workspaceId, workspaceId),
        eq(schema.segment.id, segmentId),
      ),
    });
    if (!segmentPostCalc) {
      logger().error(
        { workspaceId, segmentId },
        "Segment not found while appending to manual segment",
      );
      return false;
    }
    const definitionResultPost = schemaValidateWithErr(
      segmentPostCalc.definition,
      SegmentDefinition,
    );
    if (definitionResultPost.isErr()) {
      logger().error(
        { workspaceId, segmentId, err: definitionResultPost.error },
        "Invalid segment definition while appending to manual segment",
      );
      return false;
    }
    const { entryNode: entryNodePost, ...restDefinition } =
      definitionResultPost.value;
    if (entryNodePost.type !== SegmentNodeType.Manual) {
      logger().error(
        { workspaceId, segmentId },
        "Manual segment definition does not contain a manual node",
      );
      return false;
    }
    const newEntry: ManualSegmentNode = {
      ...entryNodePost,
      lastComputedAt: new Date(now).toISOString(),
    };
    const newDefinition = {
      ...restDefinition,
      entryNode: newEntry,
    };

    await tx
      .update(schema.segment)
      .set({
        definition: newDefinition,
      })
      .where(eq(schema.segment.id, segmentId));
    return true;
  });
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
