/* eslint-disable no-await-in-loop */
import { and, eq } from "drizzle-orm";

import { journey as dbJourney } from "../../../db/schema";
import { findAllIntegrationResources } from "../../../integrations";
import { findManyJourneyResourcesSafe } from "../../../journeys";
import logger from "../../../logger";
import { withSpan } from "../../../openTelemetry";
import { findManySegmentResourcesSafe } from "../../../segments";
import {
  IndividualComputedPropertyQueueItem,
  WorkspaceQueueItem,
  WorkspaceQueueItemType,
} from "../../../types";
import { findAllUserPropertyResources } from "../../../userProperties";
import {
  computeAssignments,
  ComputePropertiesArgs,
  computeState,
  processAssignments,
} from "../../computePropertiesIncremental";

export async function computePropertiesIncrementalArgs({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Omit<ComputePropertiesArgs, "now">> {
  const [journeys, userProperties, segments, integrations] = await Promise.all([
    findManyJourneyResourcesSafe(
      and(
        eq(dbJourney.workspaceId, workspaceId),
        eq(dbJourney.status, "Running"),
      ),
    ),
    findAllUserPropertyResources({
      workspaceId,
      requireRunning: true,
    }),
    findManySegmentResourcesSafe({
      workspaceId,
      requireRunning: true,
    }),
    findAllIntegrationResources({
      workspaceId,
    }),
  ]);
  const args = {
    workspaceId,
    segments: segments.flatMap((s) => {
      if (s.isErr()) {
        logger().error(
          { err: s.error, workspaceId },
          "failed to enrich segment",
        );
        return [];
      }
      return s.value;
    }),
    userProperties,
    journeys: journeys.flatMap((j) => {
      if (j.isErr()) {
        logger().error(
          { err: j.error, workspaceId },
          "failed to enrich journey",
        );
        return [];
      }
      if (j.value.status === "NotStarted") {
        return [];
      }
      return j.value;
    }),
    integrations: integrations.flatMap((i) => {
      if (i.isErr()) {
        logger().error(
          { err: i.error, workspaceId },
          "failed to enrich integration",
        );
        return [];
      }
      return i.value;
    }),
  };
  return args;
}

export async function computePropertiesIncremental({
  workspaceId,
  segments,
  userProperties,
  journeys,
  integrations,
  now,
}: ComputePropertiesArgs) {
  return withSpan({ name: "compute-properties-incremental" }, async (span) => {
    const commonAttributes = {
      workspaceId,
      segments: segments.map((s) => s.id),
      userProperties: userProperties.map((up) => up.id),
      journeys: journeys.map((j) => j.id),
      integrations: integrations.map((i) => i.id),
      now: new Date(now).toISOString(),
    };
    span.setAttributes(commonAttributes);

    try {
      await computeState({
        workspaceId,
        segments,
        userProperties,
        now,
      });
      await computeAssignments({
        workspaceId,
        segments,
        userProperties,
        now,
      });
      await processAssignments({
        workspaceId,
        segments,
        userProperties,
        now,
        journeys,
        integrations,
      });
    } catch (e) {
      logger().error(
        {
          ...commonAttributes,
          err: e,
        },
        "Failed to recompute properties",
      );

      throw e;
    }
  });
}

export async function computePropertiesContained({
  workspaceId,
  now,
}: {
  workspaceId: string;
  now: number;
}) {
  const args = await computePropertiesIncrementalArgs({
    workspaceId,
  });
  await computePropertiesIncremental({
    ...args,
    now,
  });
}

/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */
export async function computePropertiesContainedV2({
  item,
  now,
}: {
  item: WorkspaceQueueItem;
  now: number;
}): Promise<IndividualComputedPropertyQueueItem[] | null> {
  // TODO implement splitting logic
  return null;
}

// --- Targeted computation helper ---

export async function computePropertiesIndividual({
  item,
  now,
}: {
  item: IndividualComputedPropertyQueueItem;
  now: number;
}): Promise<void> {
  switch (item.type) {
    case WorkspaceQueueItemType.Segment: {
      const segmentsResult = await findManySegmentResourcesSafe({
        workspaceId: item.workspaceId,
        segmentIds: [item.id],
        requireRunning: false,
      });
      const segments = segmentsResult.flatMap((r) => {
        if (r.isErr()) {
          logger().error(
            { err: r.error, workspaceId: item.workspaceId },
            "failed to get segment",
          );
          return [];
        }
        return [r.value];
      });
      await computePropertiesIncremental({
        workspaceId: item.workspaceId,
        segments,
        userProperties: [],
        journeys: [],
        integrations: [],
        now,
      });
      break;
    }
    case WorkspaceQueueItemType.UserProperty: {
      const userProperties = await findAllUserPropertyResources({
        workspaceId: item.workspaceId,
        requireRunning: false,
      });
      const filtered = userProperties.filter((up) => up.id === item.id);
      await computePropertiesIncremental({
        workspaceId: item.workspaceId,
        segments: [],
        userProperties: filtered,
        journeys: [],
        integrations: [],
        now,
      });
      break;
    }
    default:
      // For Integration/Journey leave for future.
      throw new Error(`Unsupported individual item type ${item.type}`);
  }
}
