import { WorkflowClient } from "@temporalio/client";
import { ComputedPropertyUpdate } from "isomorphic-lib/src/types";

import connectWorkflowClient from "../../temporal/connectWorkflowClient";
import {
  generateHubspotUserWorkflowId,
  hubspotUserComputedProperties,
  hubspotUserWorkflow,
} from "../hubspotUserWorkflow";

export async function startHubspotUserIntegrationWorkflow({
  workspaceId,
  userId,
  computedPropertyAssignment,
  workflowClient,
}: {
  workspaceId: string;
  userId: string;
  computedPropertyAssignment: ComputedPropertyUpdate;
  workflowClient?: WorkflowClient;
}) {
  const wc = workflowClient ?? (await connectWorkflowClient());

  await wc.signalWithStart<
    typeof hubspotUserWorkflow,
    [ComputedPropertyUpdate]
  >(hubspotUserWorkflow, {
    taskQueue: "default",
    workflowId: generateHubspotUserWorkflowId({ workspaceId, userId }),
    args: [{ workspaceId, userId }],
    signal: hubspotUserComputedProperties,
    signalArgs: [computedPropertyAssignment],
  });
}
