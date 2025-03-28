import { proxyActivities } from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "../temporal/activities";

const {} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export function generateBroadcastWorkflowId({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}) {
  return `broadcast-workflow-v2-${workspaceId}-${broadcastId}`;
}

export interface BroadcastWorkflowV2Params {
  workspaceId: string;
  broadcastId: string;
}

export async function broadcastWorkflowV2({
  workspaceId,
  broadcastId,
}: BroadcastWorkflowV2Params): Promise<void> {
  // TODO: Implement the workflow
}
