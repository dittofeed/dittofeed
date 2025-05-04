import { LoggerSinks, proxyActivities, proxySinks } from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "../temporal/activities";

/**
 * Activities
 */
const { config } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minutes",
});

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export function generateRecomputeBroadcastSegmentWorkflowId({
  workspaceId,
  broadcastId,
}: RecomputeBroadcastSegmentWorkflowParams) {
  return `recompute-broadcast-segment-workflow-${workspaceId}-${broadcastId}`;
}

export interface RecomputeBroadcastSegmentWorkflowParams {
  workspaceId: string;
  broadcastId: string;
}

export async function recomputeBroadcastSegmentWorkflow({
  workspaceId,
  broadcastId,
}: RecomputeBroadcastSegmentWorkflowParams) {
  const now = Date.now();

  const { computedPropertiesActivityTaskQueue } = await config([
    "computedPropertiesActivityTaskQueue",
  ]);
  const { recomputeBroadcastSegment } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    taskQueue: computedPropertiesActivityTaskQueue,
  });
  logger.info("Recomputing broadcast segment", {
    workspaceId,
    broadcastId,
    now,
    taskQueue: computedPropertiesActivityTaskQueue,
  });
  const success = await recomputeBroadcastSegment({
    workspaceId,
    broadcastId,
    now,
  });
  logger.info("Attempted to recompute broadcast segment", {
    workspaceId,
    broadcastId,
    success,
  });
  return success;
}
