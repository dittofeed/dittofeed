import { WorkflowClient } from "@temporalio/client";

import config from "../../config";
import connectWorkflowClient from "../../temporal/connectWorkflowClient";
import {
  computePropertiesWorkflow,
  generateComputePropertiesId,
} from "../computePropertiesWorkflow";

export async function startComputePropertiesWorkflow({
  workspaceId,
  client,
}: {
  workspaceId: string;
  client?: WorkflowClient;
}) {
  const temporalClient = client ?? (await connectWorkflowClient());
  await temporalClient.start(computePropertiesWorkflow, {
    taskQueue: "default",
    workflowId: generateComputePropertiesId(workspaceId),
    args: [
      {
        tableVersion: config().defaultUserEventsTableVersion,
        workspaceId,
        shouldContinueAsNew: true,
      },
    ],
  });
}
export async function restartComputePropertiesWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const client = await connectWorkflowClient();
  await client.getHandle(generateComputePropertiesId(workspaceId)).terminate();
  await startComputePropertiesWorkflow({
    workspaceId,
    client,
  });
}
