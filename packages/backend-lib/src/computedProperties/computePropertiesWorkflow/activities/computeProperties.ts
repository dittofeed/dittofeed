/* eslint-disable no-await-in-loop */
import { and, eq, inArray } from "drizzle-orm";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";

import { ClickHouseQueryBuilder, query as chQuery } from "../../../clickhouse";
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

export interface ComputePropertiesIncrementalArgsParams {
  workspaceId: string;
  journeyIds?: string[];
  integrationIds?: string[];
  segmentIds?: string[];
  userPropertyIds?: string[];
}

export async function computePropertiesIncrementalArgs({
  workspaceId,
  journeyIds,
  integrationIds,
  segmentIds,
  userPropertyIds,
}: ComputePropertiesIncrementalArgsParams): Promise<
  Omit<ComputePropertiesArgs, "now">
> {
  const [journeys, userProperties, segments, integrations] = await Promise.all([
    journeyIds !== undefined && journeyIds.length === 0
      ? []
      : findManyJourneyResourcesSafe(
          and(
            eq(dbJourney.workspaceId, workspaceId),
            eq(dbJourney.status, "Running"),
            ...(journeyIds ? [inArray(dbJourney.id, journeyIds)] : []),
          ),
        ),
    userPropertyIds !== undefined && userPropertyIds.length === 0
      ? []
      : findAllUserPropertyResources({
          workspaceId,
          requireRunning: true,
          ids: userPropertyIds,
        }),
    segmentIds !== undefined && segmentIds.length === 0
      ? []
      : findManySegmentResourcesSafe({
          workspaceId,
          requireRunning: true,
          segmentIds,
        }),
    integrationIds !== undefined && integrationIds.length === 0
      ? []
      : findAllIntegrationResources({
          workspaceId,
          ids: integrationIds,
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
    case WorkspaceQueueItemType.Integration: {
      const integrationResults = await findAllIntegrationResources({
        workspaceId: item.workspaceId,
      });
      const integrations = integrationResults.flatMap((r) => {
        if (r.isErr()) {
          logger().error(
            { err: r.error, workspaceId: item.workspaceId },
            "failed to get integration",
          );
          return [];
        }
        if (r.value.id === item.id) {
          return [r.value];
        }
        return [];
      });
      await computePropertiesIncremental({
        workspaceId: item.workspaceId,
        segments: [],
        userProperties: [],
        journeys: [],
        integrations,
        now,
      });
      break;
    }
    case WorkspaceQueueItemType.Journey: {
      const journeyResults = await findManyJourneyResourcesSafe(
        and(
          eq(dbJourney.workspaceId, item.workspaceId),
          eq(dbJourney.id, item.id),
        ),
      );
      const journeys = journeyResults.flatMap((j) => {
        if (j.isErr()) {
          logger().error(
            { err: j.error, workspaceId: item.workspaceId },
            "failed to get journey",
          );
          return [];
        }
        return j.value.status === "Running" ? [j.value] : [];
      });
      await computePropertiesIncremental({
        workspaceId: item.workspaceId,
        segments: [],
        userProperties: [],
        journeys,
        integrations: [],
        now,
      });
      break;
    }
    default:
      assertUnreachable(item);
  }
}

export async function getEventCountInPeriod({
  workspaceId,
  period,
}: {
  workspaceId: string;
  period: number;
}): Promise<number> {
  const qb = new ClickHouseQueryBuilder();
  const query = `SELECT count() AS cnt FROM user_events_v2 WHERE workspace_id = ${qb.addQueryValue(
    workspaceId,
    "String",
  )} AND processing_time => toDateTime64(${qb.addQueryValue(
    Math.floor(period / 1000),
    "Int64",
  )}, 3)`;
  const result = await chQuery({
    query,
    query_params: qb.getQueries(),
  });
  const rows = await result.json<{ cnt: number }>();
  return rows[0]?.cnt ?? 0;
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

async function computePropertiesGroup({
  now,
  ...params
}: {
  now: number;
} & ComputePropertiesIncrementalArgsParams): Promise<
  IndividualComputedPropertyQueueItem[] | null
> {
  const args = await computePropertiesIncrementalArgs(params);
  await computePropertiesIncremental({
    ...args,
    now,
  });
  return null;
}

export async function computePropertiesContainedV2({
  item,
  now,
}: {
  item: WorkspaceQueueItem;
  now: number;
}): Promise<IndividualComputedPropertyQueueItem[] | null> {
  switch (item.type) {
    case WorkspaceQueueItemType.Journey:
    case WorkspaceQueueItemType.Integration:
    case WorkspaceQueueItemType.Segment:
    case WorkspaceQueueItemType.UserProperty:
      await computePropertiesIndividual({
        item,
        now,
      });
      return null;
      break;
    case WorkspaceQueueItemType.Workspace:
    case undefined: {
      return computePropertiesGroup({
        workspaceId: item.id,
        now,
      });
      break;
    }
    case WorkspaceQueueItemType.Batch: {
      const { workspaceId } = item;
      const journeyIds = [];
      const integrationIds = [];
      const segmentIds = [];
      const userPropertyIds = [];
      for (const i of item.items) {
        switch (i.type) {
          case WorkspaceQueueItemType.Journey:
            journeyIds.push(i.id);
            break;
          case WorkspaceQueueItemType.Integration:
            integrationIds.push(i.id);
            break;
          case WorkspaceQueueItemType.Segment:
            segmentIds.push(i.id);
            break;
          case WorkspaceQueueItemType.UserProperty:
            userPropertyIds.push(i.id);
            break;
          default:
            assertUnreachable(i);
        }
      }
      return computePropertiesGroup({
        workspaceId,
        journeyIds,
        integrationIds,
        segmentIds,
        userPropertyIds,
        now,
      });
    }
    default:
      assertUnreachable(item);
  }
  // const threshold = config().computePropertiesBatchThreshold;

  // // Determine if this is a workspace-level item (no workspaceId field)
  // if (!("workspaceId" in item)) {
  //   const workspaceId = item.id;

  //   // Fetch segments and user properties for this workspace
  //   const args = await computePropertiesIncrementalArgs({ workspaceId });
  //   const totalProperties = args.segments.length + args.userProperties.length;

  //   if (totalProperties === 0) {
  //     // Nothing to do
  //     return null;
  //   }

  //   // Determine the starting point for event counting (earliest period)

  //   const earliest = await getEarliestComputePropertyPeriod({
  //     workspaceId,
  //   });

  //   const qb = new ClickHouseQueryBuilder();
  //   const query = `SELECT count() AS cnt FROM user_events_v2 WHERE workspace_id = ${qb.addQueryValue(
  //     workspaceId,
  //     "String",
  //   )} AND processing_time => toDateTime64(${qb.addQueryValue(
  //     Math.floor(earliest / 1000),
  //     "Int64",
  //   )}, 3)`;

  //   const result = await chQuery({
  //     query,
  //     query_params: qb.getQueries(),
  //   });
  //   const rows = await result.json<{ cnt: number }>();
  //   const events = rows[0]?.cnt ?? 0;

  //   const workload = events * totalProperties;

  //   if (workload <= threshold) {
  //     // Process entire workspace in one go (reuse v1 path elsewhere)
  //     await computePropertiesIncremental({
  //       ...args,
  //       now,
  //     });
  //     return null;
  //   }

  //   // Build split items for segments and user properties
  //   const splitItems: IndividualComputedPropertyQueueItem[] = [
  //     ...args.segments.map((s) => ({
  //       type: WorkspaceQueueItemType.Segment,
  //       workspaceId,
  //       id: s.id,
  //       priority: QUEUE_ITEM_PRIORITIES.Split,
  //       insertedAt: Date.now(),
  //     })),
  //     ...args.userProperties.map((up) => ({
  //       type: WorkspaceQueueItemType.UserProperty,
  //       workspaceId,
  //       id: up.id,
  //       priority: QUEUE_ITEM_PRIORITIES.Split,
  //       insertedAt: Date.now(),
  //     })),
  //   ];

  //   return splitItems;
  // }

  // if (
  //   item.type === WorkspaceQueueItemType.Segment ||
  //   item.type === WorkspaceQueueItemType.UserProperty
  // ) {
  //   await computePropertiesIndividual({
  //     item,
  //     now,
  //   });
  // }

  // if (item.type === WorkspaceQueueItemType.Batch) {
  //   const { workspaceId } = item;
  //   // TODO: move filtering into database queries
  //   const args = await computePropertiesIncrementalArgs({ workspaceId });

  //   // Filter journeys and integrations to those included in the batch items
  //   const journeyIds = item.items
  //     .filter(({ type }) => type === WorkspaceQueueItemType.Journey)
  //     .map(({ id }) => id);
  //   const integrationIds = item.items
  //     .filter(({ type }) => type === WorkspaceQueueItemType.Integration)
  //     .map(({ id }) => id);

  //   const journeys = args.journeys.filter(({ id }) => journeyIds.includes(id));
  //   const integrations = args.integrations.filter(({ id }) =>
  //     integrationIds.includes(id),
  //   );

  //   if (journeys.length > 0 || integrations.length > 0) {
  //     await computePropertiesIncremental({
  //       workspaceId,
  //       segments: [],
  //       userProperties: [],
  //       journeys,
  //       integrations,
  //       now,
  //     });
  //   }
  //   return null;
  // }

  // // For Journey / Integration items we intentionally fall through; they'll be processed via the legacy whole-workspace path.
  // return null;
}
