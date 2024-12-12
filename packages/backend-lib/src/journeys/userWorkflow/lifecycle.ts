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

export type StartKeyedUserJourneyProps = Omit<
  MakeRequired<UserJourneyWorkflowPropsV2, "event">,
  "version"
>;

export async function startKeyedUserJourney({
  journeyId,
  workspaceId,
  userId,
  definition,
  event,
}: StartKeyedUserJourneyProps) {
  const workflowClient = await connectWorkflowClient();
  if (definition.entryNode.type !== JourneyNodeType.EventEntryNode) {
    throw new Error("Invalid entry node type");
  }
  const workflowId = getKeyedUserJourneyWorkflowId({
    workspaceId,
    userId,
    journeyId,
    event,
    entryNode: definition.entryNode,
  });
  if (!workflowId) {
    logger().debug(
      {
        workspaceId,
        userId,
        journeyId,
        event,
        entryNode: definition.entryNode,
      },
      "unable to generate keyed user journey workflow id",
    );
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
