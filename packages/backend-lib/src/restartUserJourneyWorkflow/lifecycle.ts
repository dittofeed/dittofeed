import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";

import logger from "../logger";
import {
  generateRestartUserJourneysWorkflowId,
  restartUserJourneysWorkflow,
  RestartUserJourneyWorkflowProps,
} from "../restartUserJourneyWorkflow";
import connectWorkflowClient from "../temporal/connectWorkflowClient";

export async function restartUserJourneyWorkflow({
  journeyId,
  workspaceId,
  statusUpdatedAt,
}: RestartUserJourneyWorkflowProps) {
  const workflowClient = await connectWorkflowClient();
  const workflowId = generateRestartUserJourneysWorkflowId({
    workspaceId,
    statusUpdatedAt,
    journeyId,
  });
  if (!workflowId) {
    return;
  }

  try {
    await workflowClient.start<typeof restartUserJourneysWorkflow>(
      restartUserJourneysWorkflow,
      {
        taskQueue: "default",
        workflowId,
        args: [{ workspaceId, journeyId, statusUpdatedAt }],
      },
    );
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger().info("Restart user journey workflow already started.", {
        workflowId,
        journeyId,
        workspaceId,
      });
      return;
    }
    throw e;
  }
}
