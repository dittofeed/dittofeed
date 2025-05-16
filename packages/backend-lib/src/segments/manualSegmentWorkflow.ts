import { proxyActivities } from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "../temporal/activities";

const { performBroadcastIncremental } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export function generateManualSegmentWorkflowId({
  workspaceId,
  segmentId,
}: {
  workspaceId: string;
  segmentId: string;
}) {
  return `manual-segment-workflow-${workspaceId}-${segmentId}`;
}

export interface ManualSegmentWorkflowParams {
  workspaceId: string;
  segmentId: string;
}

export async function manualSegmentWorkflow({
  workspaceId,
  segmentId,
}: ManualSegmentWorkflowParams): Promise<{ lastComputedAt: string }> {
  throw new Error("Not implemented");
}
