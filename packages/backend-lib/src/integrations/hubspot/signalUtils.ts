import { WorkflowClient } from "@temporalio/client";
import { ComputedPropertyUpdate } from "isomorphic-lib/src/types";

import logger from "../../logger";
import connectWorkflowClient from "../../temporal/connectWorkflowClient";
import {
  generateHubspotUserWorkflowId,
  hubspotUserComputedProperties,
  hubspotUserWorkflow,
} from "../hubspotUserWorkflow";
import {
  generateId,
  hubspotWorkflow,
  hubspotWorkflowInitialize,
} from "../hubspotWorkflow";

export async function startHubspotUserIntegrationWorkflow({
  workspaceId,
  userId,
  update,
  workflowClient,
}: {
  workspaceId: string;
  userId: string;
  update: ComputedPropertyUpdate;
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
    signalArgs: [update],
  });
}

export async function startHubspotIntegrationWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const workflowClient = await connectWorkflowClient();
  logger().info("starting hubspot integration workflow", { workspaceId });

  await workflowClient.signalWithStart<typeof hubspotWorkflow>(
    hubspotWorkflow,
    {
      taskQueue: "default",
      workflowId: generateId(workspaceId),
      args: [{ workspaceId, shouldContinueAsNew: true }],
      signal: hubspotWorkflowInitialize,
      signalArgs: [],
    },
  );
}
