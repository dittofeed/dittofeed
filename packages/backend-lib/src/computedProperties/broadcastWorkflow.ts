import { proxyActivities } from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "../temporal/activities";

const { performBroadcastIncremental } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export function generateBroadcastWorkflowId({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}) {
  return `broadcast-workflow-${workspaceId}-${broadcastId}`;
}

export interface BroadcastWorkflowParams {
  workspaceId: string;
  broadcastId: string;
}

export async function broadcastWorkflow({
  workspaceId,
  broadcastId,
}: BroadcastWorkflowParams): Promise<void> {
  await performBroadcastIncremental({ workspaceId, broadcastId });
}
