import {
  continueAsNew,
  getExternalWorkflowHandle,
  LoggerSinks,
  proxyActivities,
  proxySinks,
  sleep,
} from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "../temporal/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

const { sendMessages, computeTimezones, getBroadcast } = proxyActivities<
  typeof activities
>({
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
  const broadcast = await getBroadcast({ workspaceId, broadcastId });

  if (broadcast.status !== "Draft") {
    l;
    return;
  }
  // TODO: Implement the workflow
}
