import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";

import config from "../config";
import logger from "../logger";
import connectWorkflowClient from "../temporal/connectWorkflowClient";
import {
  generateRecomputeBroadcastSegmentWorkflowId,
  recomputeBroadcastSegmentWorkflow,
  RecomputeBroadcastSegmentWorkflowParams,
} from "./recomputeBroadcastSegmentWorkflow";

export async function startRecomputeBroadcastSegmentWorkflow({
  workspaceId,
  broadcastId,
}: RecomputeBroadcastSegmentWorkflowParams) {
  const client = await connectWorkflowClient();
  try {
    logger().info(
      {
        workspaceId,
        broadcastId,
      },
      "Starting recompute broadcast segment workflow",
    );
    await client.start(recomputeBroadcastSegmentWorkflow, {
      workflowId: generateRecomputeBroadcastSegmentWorkflowId({
        workspaceId,
        broadcastId,
      }),
      args: [
        {
          workspaceId,
          broadcastId,
        },
      ],
      taskQueue: config().computedPropertiesTaskQueue,
    });
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger().info(
        {
          workspaceId,
          broadcastId,
        },
        "Recompute broadcast segment workflow already started.",
      );
    }
  }
}
