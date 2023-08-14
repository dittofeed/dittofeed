import { LoggerSinks, proxyActivities, proxySinks } from "@temporalio/workflow";
import * as wf from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "./hubspotUserWorkflow/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

const {} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export const hubspotUserComputedProperties = wf.defineSignal(
  "hubspotUserComputedProperties"
);

export function generateHubspotUserWorkflowId({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  return `hubspot-${workspaceId}-${userId}`;
}

interface HubspotWorkflowParams {
  workspaceId: string;
  userId: string;
}

export const HUBSPOT_POLLING_JITTER_COEFFICIENT = 1000;

export async function hubspotUserWorkflow({
  workspaceId,
  userId,
}: HubspotWorkflowParams): Promise<void> {
  wf.setHandler(hubspotUserComputedProperties, () => {
    logger.info("hubspot computedProperties", { workspaceId });
  });
}
