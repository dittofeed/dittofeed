/* eslint-disable no-await-in-loop */
import { aliasedTable, and, asc, eq, max, not, sql } from "drizzle-orm";

import config from "../../../config";
import { db } from "../../../db";
import { journey as dbJourney } from "../../../db/schema";
import * as schema from "../../../db/schema";
import { findAllIntegrationResources } from "../../../integrations";
import { findManyJourneyResourcesSafe } from "../../../journeys";
import logger from "../../../logger";
import { withSpan } from "../../../openTelemetry";
import { findManySegmentResourcesSafe } from "../../../segments";
import {
  ComputedPropertyStep,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "../../../types";
import { findAllUserPropertyResources } from "../../../userProperties";
import {
  computeAssignments,
  ComputePropertiesArgs as ComputePropertiesIncrementalArgs,
  computeState,
  processAssignments,
} from "../../computePropertiesIncremental";

export async function computePropertiesIncrementalArgs({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Omit<ComputePropertiesIncrementalArgs, "now">> {
  const [journeys, userProperties, segments, integrations] = await Promise.all([
    findManyJourneyResourcesSafe(
      and(
        eq(dbJourney.workspaceId, workspaceId),
        eq(dbJourney.status, "Running"),
      ),
    ),
    findAllUserPropertyResources({
      workspaceId,
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
        logger().error({ err: s.error }, "failed to enrich segment");
        return [];
      }
      return s.value;
    }),
    userProperties,
    journeys: journeys.flatMap((j) => {
      if (j.isErr()) {
        logger().error({ err: j.error }, "failed to enrich journey");
        return [];
      }
      if (j.value.status === "NotStarted") {
        return [];
      }
      return j.value;
    }),
    integrations: integrations.flatMap((i) => {
      if (i.isErr()) {
        logger().error({ err: i.error }, "failed to enrich integration");
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
}: ComputePropertiesIncrementalArgs) {
  return withSpan({ name: "compute-properties-incremental" }, async (span) => {
    span.setAttributes({
      workspaceId,
      segments: segments.map((s) => s.id),
      userProperties: userProperties.map((up) => up.id),
      journeys: journeys.map((j) => j.id),
      integrations: integrations.map((i) => i.id),
      now: new Date(now).toISOString(),
    });

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

export async function findDueWorkspaces({
  now,
  interval = config().computePropertiesInterval,
  limit = 100,
}: {
  // unix timestamp in ms
  now: number;
  interval?: number;
  limit?: number;
}): Promise<{ workspaceIds: string[] }> {
  const w = aliasedTable(schema.workspace, "w");
  const cpp = aliasedTable(schema.computedPropertyPeriod, "cpp");
  const aggregatedMax = max(cpp.to);

  const secondsInterval = `${Math.floor(interval / 1000).toString()} seconds`;
  const timestampNow = Math.floor(now / 1000);
  const periodsQuery = await db()
    .select({
      workspaceId: cpp.workspaceId,
      max: aggregatedMax,
    })
    .from(cpp)
    .innerJoin(w, eq(cpp.workspaceId, w.id))
    .where(
      and(
        eq(cpp.step, ComputedPropertyStep.ComputeAssignments),
        eq(w.status, WorkspaceStatusDbEnum.Active),
        not(eq(w.type, WorkspaceTypeAppEnum.Parent)),
      ),
    )
    .groupBy(cpp.workspaceId)
    .having(
      sql`(to_timestamp(${timestampNow}) - ${aggregatedMax}) > ${secondsInterval}::interval`,
    )
    .orderBy(sql`${aggregatedMax} ASC`)
    .limit(limit);

  return {
    workspaceIds: periodsQuery.map(({ workspaceId }) => workspaceId),
  };
}
