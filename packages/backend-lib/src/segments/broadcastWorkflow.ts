import { proxyActivities } from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "./../temporal/activities";
import * as wf from "@temporalio/workflow";
import { FEATURE_INCREMENTAL_COMP } from "../constants";

const { performBroadcast, getFeature, performBroadcastIncremental } =
  proxyActivities<typeof activities>({
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

async function useIncremental({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<boolean> {
  if (!wf.patched(FEATURE_INCREMENTAL_COMP)) {
    return false;
  }

  return getFeature({
    workspaceId,
    name: FEATURE_INCREMENTAL_COMP,
  });
}

export async function broadcastWorkflow({
  workspaceId,
  broadcastId,
}: BroadcastWorkflowParams): Promise<void> {
  if (await useIncremental({ workspaceId })) {
    await performBroadcastIncremental({ workspaceId, broadcastId });
  } else {
    await performBroadcast({ workspaceId, broadcastId });
  }
}
