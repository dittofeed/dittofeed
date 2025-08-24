import { 
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError 
} from "@temporalio/common";
import { JourneyNodeType, MakeRequired } from "isomorphic-lib/src/types";

import { jsonValue } from "../../jsonPath";
import logger from "../../logger";
import connectWorkflowClient from "../../temporal/connectWorkflowClient";
import {
  getKeyedUserJourneyWorkflowId,
  trackSignal,
  TrackSignalParams,
  TrackSignalParamsVersion,
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
    const eventKeyName = definition.entryNode.key;
    const eventKey: string | undefined = eventKeyName
      ? jsonValue({
          data: event.properties,
          path: eventKeyName,
        })
          .map((v) => {
            if (typeof v === "string" || typeof v === "number") {
              return v.toString();
            }
            return undefined;
          })
          .unwrapOr(undefined)
      : undefined;

    await workflowClient.signalWithStart<
      typeof userJourneyWorkflow,
      [TrackSignalParams]
    >(userJourneyWorkflow, {
      taskQueue: "default",
      workflowId,
      signal: trackSignal,
      signalArgs: [
        {
          version: TrackSignalParamsVersion.V2,
          messageId: event.messageId,
        },
      ],
      args: [
        {
          journeyId,
          definition,
          workspaceId,
          userId,
          eventKey,
          hidden: event.context?.hidden === true,
          messageId: event.messageId,
          version: UserJourneyWorkflowVersion.V3,
        },
      ],
    });
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger().info("User journey already started, signaling existing workflow.", {
        workflowId,
        journeyId,
        userId,
        workspaceId,
        eventKey: definition.entryNode.key,
      });
      
      // Signal the existing workflow with the new event
      try {
        await workflowClient.getHandle(workflowId).signal(trackSignal, {
          version: TrackSignalParamsVersion.V2,
          messageId: event.messageId,
        });
        logger().info("Successfully signaled existing workflow.", {
          workflowId,
          messageId: event.messageId,
        });
      } catch (signalError) {
        if (signalError instanceof WorkflowNotFoundError) {
          logger().info("Workflow no longer exists, likely completed or failed.", {
            workflowId,
            messageId: event.messageId,
          });
          // Don't throw - this is expected if workflow already completed
          return;
        }
        logger().error("Failed to signal existing workflow.", {
          workflowId,
          messageId: event.messageId,
          error: signalError,
        });
        throw signalError;
      }
      return;
    }
    throw e;
  }
}
