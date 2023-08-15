import { WorkflowClient } from "@temporalio/client";
import { ComputedPropertyAssignment } from "isomorphic-lib/src/types";

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
  computedPropertyAssignment: ComputedPropertyAssignment;
  workflowClient?: WorkflowClient;
}) {
  const wc = workflowClient ?? (await connectWorkflowClient());

  await wc.signalWithStart<
    typeof hubspotUserWorkflow,
    [ComputedPropertyAssignment]
  >(hubspotUserWorkflow, {
    taskQueue: "default",
    workflowId: generateHubspotUserWorkflowId({ workspaceId, userId }),
    args: [{ workspaceId, userId }],
    signal: hubspotUserComputedProperties,
    signalArgs: [computedPropertyAssignment],
  });
}
