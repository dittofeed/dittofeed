import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";
import {
  JourneyNodeType,
  MakeRequired,
  UserWorkflowTrackEvent,
} from "isomorphic-lib/src/types";

import logger from "../../logger";
import connectWorkflowClient from "../../temporal/connectWorkflowClient";
import {
  getKeyedUserJourneyWorkflowId,
  trackSignal,
  userJourneyWorkflow,
  UserJourneyWorkflowPropsV2,
  UserJourneyWorkflowVersion,
} from "../userWorkflow";

export async function startKeyedUserJourney({
  journeyId,
  workspaceId,
  userId,
  definition,
  event,
}: Omit<MakeRequired<UserJourneyWorkflowPropsV2, "event">, "version">) {
  const workflowClient = await connectWorkflowClient();
  if (definition.entryNode.type !== JourneyNodeType.EventEntryNode) {
    throw new Error("Invalid entry node type");
  }
  const workflowId = getKeyedUserJourneyWorkflowId({
    userId,
    journeyId,
    event,
    entryNode: definition.entryNode,
  });
  if (!workflowId) {
    return;
  }

  try {
    await workflowClient.signalWithStart<
      typeof userJourneyWorkflow,
      [UserWorkflowTrackEvent]
    >(userJourneyWorkflow, {
      taskQueue: "default",
      workflowId,
      signal: trackSignal,
      signalArgs: [event],
      args: [
        {
          journeyId,
          definition,
          workspaceId,
          userId,
          event,
          version: UserJourneyWorkflowVersion.V2,
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
        eventKey: definition.entryNode.key,
      });
      return;
    }
    throw e;
  }
}
