import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";

import logger from "../../logger";
import connectWorkflowClient from "../../temporal/connectWorkflowClient";
import {
  getUserJourneyWorkflowId,
  userJourneyWorkflow,
  UserJourneyWorkflowProps,
} from "../userWorkflow";

export async function startKeyedUserJourney({
  journeyId,
  workspaceId,
  userId,
  definition,
  eventKey,
}: UserJourneyWorkflowProps) {
  const workflowClient = await connectWorkflowClient();
  const workflowId = getUserJourneyWorkflowId({
    userId,
    journeyId,
    eventKey,
  });

  try {
    await workflowClient.start(userJourneyWorkflow, {
      taskQueue: "default",
      workflowId,
      args: [
        {
          journeyId,
          definition,
          workspaceId,
          userId,
          eventKey,
        },
      ],
    });
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger().info("User journey already started.", {
        workflowId,
        journeyId,
        userId,
        workspaceId,
        eventKey,
      });
      return;
    }
    throw e;
  }
}
