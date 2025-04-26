import { LoggerSinks, proxyActivities, proxySinks } from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "../temporal/activities";

const { recomputeBroadcastSegment } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export interface RecomputeBroadcastSegmentWorkflowParams {
  workspaceId: string;
  broadcastId: string;
}

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
