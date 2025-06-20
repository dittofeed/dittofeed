/* eslint-disable no-await-in-loop */
import { and, eq } from "drizzle-orm";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";

import { ClickHouseQueryBuilder, query as chQuery } from "../../../clickhouse";
import config from "../../../config";
import { journey as dbJourney } from "../../../db/schema";
import { findAllIntegrationResources } from "../../../integrations";
import { findManyJourneyResourcesSafe } from "../../../journeys";
import logger from "../../../logger";
import { withSpan } from "../../../openTelemetry";
import { findManySegmentResourcesSafe } from "../../../segments";
import {
  IndividualComputedPropertyQueueItem,
  SegmentQueueItem,
  UserPropertyQueueItem,
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
import { getEarliestComputePropertyPeriod } from "../../periods";

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

export async function computePropertiesIndividual({
  item,
  now,
}: {
  item: SegmentQueueItem | UserPropertyQueueItem;
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
      assertUnreachable(item);
  }
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
  const threshold = config().computePropertiesBatchThreshold;

  // Determine if this is a workspace-level item (no workspaceId field)
  if (!("workspaceId" in item)) {
    const workspaceId = item.id;

    // Fetch segments and user properties for this workspace
    const args = await computePropertiesIncrementalArgs({ workspaceId });
    const totalProperties = args.segments.length + args.userProperties.length;

    if (totalProperties === 0) {
      // Nothing to do
      return null;
    }

    // Determine the starting point for event counting (earliest period)
    const earliest = await getEarliestComputePropertyPeriod({
      workspaceId,
    });

    const qb = new ClickHouseQueryBuilder();
    const query = `SELECT count() AS cnt FROM user_events_v2 WHERE workspace_id = ${qb.addQueryValue(
      workspaceId,
      "String",
    )} AND processing_time => toDateTime64(${qb.addQueryValue(
      Math.floor(earliest / 1000),
      "Int64",
    )}, 3)`;

    const result = await chQuery({
      query,
      query_params: qb.getQueries(),
    });
    const rows = await result.json<{ cnt: number }>();
    const events = rows[0]?.cnt ?? 0;

    const workload = events * totalProperties;

    if (workload <= threshold) {
      // Process entire workspace in one go (reuse v1 path elsewhere)
      await computePropertiesIncremental({
        ...args,
        now,
      });
      return null;
    }

    // Build split items for segments and user properties
    const splitItems: IndividualComputedPropertyQueueItem[] = [
      ...args.segments.map((s) => ({
        type: WorkspaceQueueItemType.Segment,
        workspaceId,
        id: s.id,
        priority: item.priority,
        insertedAt: Date.now(),
      })),
      ...args.userProperties.map((up) => ({
        type: WorkspaceQueueItemType.UserProperty,
        workspaceId,
        id: up.id,
        priority: item.priority,
        insertedAt: Date.now(),
      })),
    ];

    return splitItems;
  }

  if (
    item.type === WorkspaceQueueItemType.Segment ||
    item.type === WorkspaceQueueItemType.UserProperty
  ) {
    await computePropertiesIndividual({
      item,
      now,
    });
  }

  // For Journey / Integration items we intentionally fall through; they'll be processed via the legacy whole-workspace path.
  return null;
}
