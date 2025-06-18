import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";

import config from "../config";
import logger from "../logger";
import connectWorkflowClient from "../temporal/connectWorkflowClient";
import { DBWorkspaceOccupantType } from "../types";
import {
  broadcastWorkflowV2,
  generateBroadcastWorkflowV2Id,
} from "./broadcastWorkflowV2";
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
          err: e,
        },
        "Recompute broadcast segment workflow already started.",
      );
    }
    throw e;
  }
}

export async function startBroadcastWorkflow({
  workspaceId,
  broadcastId,
  workspaceOccupantId,
  workspaceOccupantType,
}: {
  workspaceId: string;
  broadcastId: string;
  workspaceOccupantId?: string;
  workspaceOccupantType?: DBWorkspaceOccupantType;
}) {
  const client = await connectWorkflowClient();
  try {
    logger().info(
      {
        workspaceId,
        broadcastId,
        workspaceOccupantId,
        workspaceOccupantType,
      },
      "Starting broadcast workflow",
    );
    await client.start(broadcastWorkflowV2, {
      workflowId: generateBroadcastWorkflowV2Id({
        workspaceId,
        broadcastId,
      }),
      args: [
        {
          workspaceId,
          broadcastId,
          workspaceOccupantId,
          workspaceOccupantType,
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
          err: e,
        },
        "Broadcast workflow already started.",
      );
      return;
    }
    logger().error(
      {
        workspaceId,
        broadcastId,
        err: e,
      },
      "Error starting broadcast workflow",
    );
    throw e;
  }
}
