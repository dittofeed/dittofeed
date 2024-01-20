import { WorkflowClient } from "@temporalio/client";

import config from "../../config";
import logger from "../../logger";
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
  const {
    computePropertiesWorkflowTaskTimeout,
    defaultUserEventsTableVersion,
  } = config();
  await temporalClient.start(computePropertiesWorkflow, {
    taskQueue: "default",
    workflowId: generateComputePropertiesId(workspaceId),
    workflowTaskTimeout: computePropertiesWorkflowTaskTimeout,
    args: [
      {
        tableVersion: defaultUserEventsTableVersion,
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
  try {
    await client
      .getHandle(generateComputePropertiesId(workspaceId))
      .terminate();
  } catch (e) {
    logger().error(
      {
        err: e,
      },
      "Failed to terminate compute properties workflow."
    );
  }

  try {
    await startComputePropertiesWorkflow({
      workspaceId,
      client,
    });
  } catch (e) {
    logger().error(
      {
        err: e,
      },
      "Failed to start compute properties workflow."
    );
  }
}
