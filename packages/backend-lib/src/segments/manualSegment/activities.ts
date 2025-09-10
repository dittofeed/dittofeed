import { and, eq } from "drizzle-orm";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { getNewManualSegmentVersion } from "isomorphic-lib/src/segments";
import {
  BatchItem,
  EventType,
  InternalEventType,
  ManualSegmentNode,
  SavedSegmentResource,
  SegmentDefinition,
  SegmentNodeType,
} from "isomorphic-lib/src/types";
import pRetry from "p-retry";
import { v5 as uuidv5, validate as validateUuid } from "uuid";

import { submitBatch } from "../../apps/batch";
import { computePropertiesIncremental } from "../../computedProperties/computePropertiesWorkflow/activities";
import { enqueueRecompute } from "../../computedProperties/computePropertiesWorkflow/lifecycle";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { findAllIntegrationResources } from "../../integrations";
import { findRunningJourneys, getSubscribedSegments } from "../../journeys";
import logger from "../../logger";
import { toSegmentResource } from "../../segments";
import { Segment } from "../../types";
import { getEventsCountById } from "../../userEvents";
import { findAllUserPropertyResources } from "../../userProperties";

async function computePropertiesForManualSegment({
  workspaceId,
  segment,
  now,
}: {
  workspaceId: string;
  segment: SavedSegmentResource;
  now: number;
}) {
  // Enqueue a follow-up full workspace recompute through the queue workflow
  await enqueueRecompute({
    items: [{ id: workspaceId }],
  });

  // Gather dependencies for targeted recompute: subscribed journeys, integrations, and core user properties
  const [journeys, integrations, userProperties] = await Promise.all([
    findRunningJourneys({ workspaceId }),
    findAllIntegrationResources({ workspaceId }),
    findAllUserPropertyResources({
      workspaceId,
      names: ["id", "anonymousId"],
    }),
  ]);

  const subscribedJourneys = journeys.filter((j) =>
    getSubscribedSegments(j.definition).has(segment.id),
  );

  const subscribedIntegrations = integrations.flatMap((i) => {
    if (i.isErr()) {
      logger().error(
        { err: i.error, workspaceId, segmentId: segment.id },
        "failed to parse integration for manual segment recompute",
      );
      return [];
    }
    return i.value.definition.subscribedSegments.includes(segment.id)
      ? [i.value]
      : [];
  });

  // Synchronously recompute only the passed segment (with its dependencies)
  const args = {
    workspaceId,
    segments: [segment],
    userProperties,
    journeys: subscribedJourneys,
    integrations: subscribedIntegrations,
    now,
  };
  logger().info(
    { workspaceId, segmentId: segment.id },
    "recomputing properties for manual segment (targeted)",
  );
  await computePropertiesIncremental(args);
}

function getManualSegmentDefinition(
  segment: Segment,
  {
    workspaceId,
    segmentId,
  }: {
    workspaceId: string;
    segmentId: string;
  },
):
  | ({
      entryNode: ManualSegmentNode;
    } & Omit<SegmentDefinition, "entryNode">)
  | null {
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
    return null;
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
    return null;
  }
  return {
    ...definitionResult.value,
    entryNode,
  };
}

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
  const definition = getManualSegmentDefinition(segment, {
    workspaceId,
    segmentId,
  });
  if (!definition) {
    return false;
  }
  const { entryNode } = definition;
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

  const messageIds = batch.map((item) => item.messageId);
  const expectedCount = messageIds.length;

  // Wait for events to be processed with exponential retry
  await pRetry(
    async () => {
      const actualCount = await getEventsCountById({
        workspaceId,
        eventIds: messageIds,
      });

      logger().debug(
        { expectedCount, actualCount, segmentId, workspaceId },
        "Checking event count for manual segment",
      );

      if (actualCount < expectedCount) {
        throw new Error(
          `Expected ${expectedCount} events, but found ${actualCount}`,
        );
      }
    },
    // 1s + 2s + 4s + 8s + 16s + 30s + 30s + 30s + 30s + 30s = 181 seconds or ~3 minutes < 5 minute activity timeout
    {
      retries: 10,
      minTimeout: 1000, // 1 second
      maxTimeout: 30000, // 30 seconds max per retry
      factor: 2,
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

  await computePropertiesForManualSegment({
    workspaceId,
    segment: segmentResource.value,
    now,
  });
  return true;
}

export async function replaceManualSegment({
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
  const newManualSegmentNode: [ManualSegmentNode, Segment] | null =
    await db().transaction(async (tx) => {
      let segment: Segment | undefined;
      if (validateUuid(segmentId)) {
        segment = await tx.query.segment.findFirst({
          where: and(
            eq(schema.segment.workspaceId, workspaceId),
            eq(schema.segment.id, segmentId),
          ),
        });
      }
      if (!segment) {
        logger().info(
          {
            workspaceId,
            segmentId,
          },
          "Segment not found while appending to manual segment",
        );
        return null;
      }
      const definition = getManualSegmentDefinition(segment, {
        workspaceId,
        segmentId,
      });
      if (!definition) {
        return null;
      }
      const { entryNode } = definition;
      const newEntry: ManualSegmentNode = {
        ...entryNode,
        version: getNewManualSegmentVersion(now),
      };
      const newDefinition: SegmentDefinition = {
        ...definition,
        entryNode: newEntry,
      };
      const [updated] = await tx
        .update(schema.segment)
        .set({
          definition: newDefinition,
          definitionUpdatedAt: new Date(now),
        })
        .where(
          and(
            eq(schema.segment.workspaceId, workspaceId),
            eq(schema.segment.id, segmentId),
          ),
        )
        .returning();
      if (!updated) {
        logger().error(
          {
            workspaceId,
            segmentId,
          },
          "Segment not found while appending to manual segment",
        );
        return null;
      }
      return [newEntry, updated];
    });
  if (!newManualSegmentNode) {
    return false;
  }
  const [newEntry, updated] = newManualSegmentNode;
  const batch: BatchItem[] = userIds.flatMap((userId) => {
    return [
      {
        type: EventType.Track,
        userId,
        timestamp: new Date(now).toISOString(),
        event: InternalEventType.ManualSegmentUpdate,
        properties: {
          segmentId,
          version: newEntry.version,
          inSegment: 1,
        },
        messageId: uuidv5(
          `manual-update-${segmentId}-${newEntry.version}-${userId}`,
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
      // Ensure producer-side processing_time is respected by forcing ch-sync
      writeModeOverride: "ch-sync",
    },
  );
  const segmentResource = toSegmentResource(updated);
  if (segmentResource.isErr()) {
    logger().error(
      { err: segmentResource.error, workspaceId, segmentId },
      "Failed to convert segment to resource",
    );
    return false;
  }
  await computePropertiesForManualSegment({
    workspaceId,
    segment: segmentResource.value,
    now,
  });
  return true;
}

export async function clearManualSegment({
  workspaceId,
  segmentId,
  now,
}: {
  workspaceId: string;
  segmentId: string;
  now: number;
}): Promise<boolean> {
  return replaceManualSegment({
    workspaceId,
    segmentId,
    userIds: [],
    now,
  });
}
