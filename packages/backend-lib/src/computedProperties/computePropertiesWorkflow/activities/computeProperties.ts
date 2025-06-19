/* eslint-disable no-await-in-loop */
import { findAllIntegrationResources } from "../../../integrations";
import { findRunningJourneys } from "../../../journeys";
import logger from "../../../logger";
import { withSpan } from "../../../openTelemetry";
import { findManySegmentResourcesSafe } from "../../../segments";
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
    findRunningJourneys(workspaceId),
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
    journeys,
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
