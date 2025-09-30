/* eslint-disable no-await-in-loop */
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";

import { ClickHouseQueryBuilder, query as chQuery } from "../../../clickhouse";
import config from "../../../config";
import { QUEUE_ITEM_PRIORITIES } from "../../../constants";
import { findAllIntegrationResources } from "../../../integrations";
import { findRunningJourneys, getSubscribedSegments } from "../../../journeys";
import logger from "../../../logger";
import { withSpan } from "../../../openTelemetry";
import { findManySegmentResourcesSafe } from "../../../segments";
import {
  IndividualComputedPropertyQueueItem,
  JourneyNodeType,
  SavedUserPropertyResource,
  WorkspaceQueueItem,
  WorkspaceQueueItemType,
} from "../../../types";
import { findAllUserPropertyResources } from "../../../userProperties";
import {
  computeAssignments,
  ComputePropertiesArgs,
  computeState,
  processAssignments,
  pruneComputedProperties,
} from "../../computePropertiesIncremental";

export interface ComputePropertiesIncrementalArgsParams {
  workspaceId: string;
  journeyIds?: string[];
  integrationIds?: string[];
  segmentIds?: string[];
  userPropertyIds?: string[];
}

export async function getComputedUserPropertyArgs({
  workspaceId,
  userPropertyIds,
}: {
  workspaceId: string;
  userPropertyIds?: string[];
}): Promise<SavedUserPropertyResource[]> {
  const userProperties = await findAllUserPropertyResources({
    workspaceId,
    requireRunning: true,
    ids: userPropertyIds,
    // only add id and anonymousId if we're purposely restricting the set of
    // user properties. this way the subset will be guaranteed to include them.
    // otherwise we'll get all user properties.
    names: userPropertyIds?.length ? ["id", "anonymousId"] : undefined,
  });
  return userProperties;
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
    findRunningJourneys({ workspaceId, ids: journeyIds }),
    getComputedUserPropertyArgs({ workspaceId, userPropertyIds }),
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
    journeys: journeys.filter(
      (j) => j.definition.entryNode.type === JourneyNodeType.SegmentEntryNode,
    ),
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

export async function computePropertiesIncremental(
  args: ComputePropertiesArgs,
) {
  return withSpan({ name: "compute-properties-incremental" }, async (span) => {
    const commonAttributes = {
      workspaceId: args.workspaceId,
      segments: args.segments.map((s) => s.id),
      userProperties: args.userProperties.map((up) => up.id),
      journeys: args.journeys.map((j) => j.id),
      integrations: args.integrations.map((i) => i.id),
      now: new Date(args.now).toISOString(),
    };
    span.setAttributes(commonAttributes);
    try {
      const prunedComputedProperties = await pruneComputedProperties(args);
      const paramsWithPruned = {
        ...args,
        prunedComputedProperties,
      };
      await computeState(paramsWithPruned);
      await computeAssignments(paramsWithPruned);
      await processAssignments(paramsWithPruned);
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
      const [segmentsResult, userProperties, integrations, journeys] =
        await Promise.all([
          findManySegmentResourcesSafe({
            workspaceId: item.workspaceId,
            segmentIds: [item.id],
            requireRunning: false,
          }),
          findAllUserPropertyResources({
            workspaceId: item.workspaceId,
            names: ["id", "anonymousId"],
          }),
          findAllIntegrationResources({
            workspaceId: item.workspaceId,
          }),
          findRunningJourneys({
            workspaceId: item.workspaceId,
          }),
        ]);
      const subscribedJourneys = journeys.filter((j) =>
        getSubscribedSegments(j.definition).has(item.id),
      );
      const subscribedIntegrations = integrations.flatMap((i) => {
        if (i.isErr()) {
          logger().error(
            {
              err: i.error,
              workspaceId: item.workspaceId,
              segmentId: item.id,
              integration: i,
            },
            "failed to parse integration for segment",
          );
          return [];
        }
        return i.value.definition.subscribedSegments.includes(item.id)
          ? [i.value]
          : [];
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
        userProperties,
        journeys: subscribedJourneys,
        integrations: subscribedIntegrations,
        now,
      });
      break;
    }
    case WorkspaceQueueItemType.UserProperty: {
      const userProperties = await findAllUserPropertyResources({
        workspaceId: item.workspaceId,
        requireRunning: false,
        ids: [item.id],
        names: ["id", "anonymousId"],
      });
      await computePropertiesIncremental({
        workspaceId: item.workspaceId,
        segments: [],
        userProperties,
        journeys: [],
        integrations: [],
        now,
      });
      break;
    }
    case WorkspaceQueueItemType.Integration: {
      const integrationResults = await findAllIntegrationResources({
        workspaceId: item.workspaceId,
        ids: [item.id],
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
      const segmentIds = integrations.flatMap((i) => {
        return i.definition.subscribedSegments;
      });
      const userPropertyIds = integrations.flatMap((i) => {
        return i.definition.subscribedUserProperties;
      });
      const [subscribedSegments, userPropertyDeps] = await Promise.all([
        findManySegmentResourcesSafe({
          workspaceId: item.workspaceId,
          segmentIds,
        }).then((results) =>
          results.flatMap((r) => {
            if (r.isErr()) {
              return [];
            }
            return [r.value];
          }),
        ),
        findAllUserPropertyResources({
          workspaceId: item.workspaceId,
          ids: userPropertyIds,
          names: ["id", "anonymousId"],
        }),
      ]);
      await computePropertiesIncremental({
        workspaceId: item.workspaceId,
        segments: subscribedSegments,
        userProperties: userPropertyDeps,
        journeys: [],
        integrations,
        now,
      });
      break;
    }
    case WorkspaceQueueItemType.Journey: {
      const [journeys, userProperties] = await Promise.all([
        findRunningJourneys({
          workspaceId: item.workspaceId,
          ids: [item.id],
        }),
        findAllUserPropertyResources({
          workspaceId: item.workspaceId,
          names: ["id", "anonymousId"],
        }),
      ]);
      const journey = journeys.find((j) => j.id === item.id);
      if (!journey) {
        logger().error(
          { workspaceId: item.workspaceId, journeyId: item.id },
          "journey not found in computePropertiesIndividual",
        );
        return;
      }
      if (
        journey.definition.entryNode.type !== JourneyNodeType.SegmentEntryNode
      ) {
        logger().error(
          { workspaceId: item.workspaceId, journeyId: item.id },
          "journey is not a segment entry node in computePropertiesIndividual",
        );
        return;
      }
      const subscribedSegments = Array.from(
        getSubscribedSegments(journey.definition),
      );
      const segments = await findManySegmentResourcesSafe({
        workspaceId: item.workspaceId,
        segmentIds: subscribedSegments,
      }).then((results) =>
        results.flatMap((r) => {
          if (r.isErr()) {
            return [];
          }
          return [r.value];
        }),
      );
      await computePropertiesIncremental({
        workspaceId: item.workspaceId,
        segments,
        userProperties,
        journeys: [journey],
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
  split = false,
  ...params
}: {
  now: number;
  split?: boolean;
} & ComputePropertiesIncrementalArgsParams): Promise<
  IndividualComputedPropertyQueueItem[] | null
> {
  const args = await computePropertiesIncrementalArgs(params);
  if (split) {
    logger().info(
      { workspaceId: params.workspaceId },
      "Splitting compute properties",
    );
    const individualItems: IndividualComputedPropertyQueueItem[] = [];
    for (const userProperty of args.userProperties) {
      individualItems.push({
        type: WorkspaceQueueItemType.UserProperty,
        workspaceId: params.workspaceId,
        id: userProperty.id,
        priority: QUEUE_ITEM_PRIORITIES.Split,
      });
    }
    for (const segment of args.segments) {
      individualItems.push({
        type: WorkspaceQueueItemType.Segment,
        workspaceId: params.workspaceId,
        id: segment.id,
        priority: QUEUE_ITEM_PRIORITIES.Split,
      });
    }
    for (const integration of args.integrations) {
      individualItems.push({
        type: WorkspaceQueueItemType.Integration,
        workspaceId: params.workspaceId,
        id: integration.id,
        priority: QUEUE_ITEM_PRIORITIES.Split,
      });
    }
    for (const journey of args.journeys) {
      individualItems.push({
        type: WorkspaceQueueItemType.Journey,
        workspaceId: params.workspaceId,
        id: journey.id,
        priority: QUEUE_ITEM_PRIORITIES.Split,
      });
    }
    return individualItems;
  }
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
        split: config().computePropertiesSplit,
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
}
