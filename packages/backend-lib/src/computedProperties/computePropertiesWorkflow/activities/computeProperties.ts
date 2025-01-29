/* eslint-disable no-await-in-loop */
import { aliasedTable, and, eq, max, sql } from "drizzle-orm";

import config from "../../../config";
import { db } from "../../../db";
import { journey as dbJourney } from "../../../db/schema";
import * as schema from "../../../db/schema";
import { findAllIntegrationResources } from "../../../integrations";
import { findManyJourneyResourcesSafe } from "../../../journeys";
import logger from "../../../logger";
import { withSpan } from "../../../openTelemetry";
import { findManySegmentResourcesSafe } from "../../../segments";
import { ComputedPropertyStep } from "../../../types";
import { findAllUserPropertyResources } from "../../../userProperties";
import { RECOMPUTABLE_WORKSPACES_QUERY } from "../../../workspaces";
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
  steps,
}: ComputePropertiesIncrementalArgs & {
  steps?: ComputedPropertyStep[];
}) {
  return withSpan({ name: "compute-properties-incremental" }, async (span) => {
    span.setAttributes({
      workspaceId,
      segments: segments.map((s) => s.id),
      userProperties: userProperties.map((up) => up.id),
      journeys: journeys.map((j) => j.id),
      integrations: integrations.map((i) => i.id),
      now: new Date(now).toISOString(),
      steps,
    });
    const stepsSet =
      steps !== undefined ? new Set<ComputedPropertyStep>(steps) : null;

    if (!stepsSet || stepsSet.has(ComputedPropertyStep.ComputeState)) {
      await computeState({
        workspaceId,
        segments,
        userProperties,
        now,
      });
    }
    if (!stepsSet || stepsSet.has(ComputedPropertyStep.ComputeAssignments)) {
      await computeAssignments({
        workspaceId,
        segments,
        userProperties,
        now,
      });
    }
    if (!stepsSet || stepsSet.has(ComputedPropertyStep.ProcessAssignments)) {
      await processAssignments({
        workspaceId,
        segments,
        userProperties,
        now,
        journeys,
        integrations,
      });
    }
  });
}

export async function findDueWorkspaces({
  now,
}: {
  // unix timestamp in ms
  now: number;
}): Promise<{ workspaceIds: string[] }> {
  const { computePropertiesInterval } = config();
  const w = aliasedTable(schema.workspace, "w");
  const cpp = aliasedTable(schema.computedPropertyPeriod, "cpp");
  const periodsQuery = await db()
    .select({
      workspaceId: cpp.workspaceId,
      to: max(cpp.to),
      timeDifference: sql<number>`to_timestamp(${now} / 1000) - ${max(cpp.to)}`,
    })
    .from(cpp)
    .innerJoin(w, eq(cpp.workspaceId, w.id))
    .where(
      and(
        eq(cpp.step, ComputedPropertyStep.ComputeAssignments),
        RECOMPUTABLE_WORKSPACES_QUERY,
      ),
    )
    .groupBy(cpp.workspaceId)
    .having(
      ({ timeDifference }) =>
        sql`${timeDifference} > interval '${computePropertiesInterval / 1000} seconds'`,
    );

  return {
    workspaceIds: periodsQuery.map(({ workspaceId }) => workspaceId),
  };
}

export async function processAssignmentsBatch({
  workspaceIds,
  now,
}: {
  workspaceIds: string[];
  now: number;
}) {
  throw new Error("Not implemented");
}
