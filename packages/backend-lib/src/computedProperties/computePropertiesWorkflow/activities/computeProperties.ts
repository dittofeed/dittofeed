/* eslint-disable no-await-in-loop */
import { and, eq } from "drizzle-orm";

import { journey as dbJourney } from "../../../db/schema";
import { findAllIntegrationResources } from "../../../integrations";
import { findManyJourneyResourcesSafe } from "../../../journeys";
import logger from "../../../logger";
import { withSpan } from "../../../openTelemetry";
import { findManySegmentResourcesSafe } from "../../../segments";
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
