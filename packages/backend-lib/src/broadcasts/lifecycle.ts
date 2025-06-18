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
        },
        "Recompute broadcast segment workflow already started.",
      );
    }
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
    logger().error(
      {
        workspaceId,
        broadcastId,
      },
      "Error starting broadcast workflow",
    );
  }
}

export async function pauseBroadcast({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}) {
  const client = await connectWorkflowClient();
  try {
    logger().info(
      {
        workspaceId,
        broadcastId,
      },
      "Pausing broadcast workflow",
    );
    const handle = client.getHandle(
      generateBroadcastWorkflowV2Id({
        workspaceId,
        broadcastId,
      }),
    );
    await handle.signal("PauseBroadcast");
  } catch (e) {
    logger().error(
      {
        workspaceId,
        broadcastId,
        error: e,
      },
      "Error pausing broadcast workflow",
    );
    throw e;
  }
}

export async function resumeBroadcast({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}) {
  const client = await connectWorkflowClient();
  try {
    logger().info(
      {
        workspaceId,
        broadcastId,
      },
      "Resuming broadcast workflow",
    );
    const handle = client.getHandle(
      generateBroadcastWorkflowV2Id({
        workspaceId,
        broadcastId,
      }),
    );
    await handle.signal("ResumeBroadcast");
  } catch (e) {
    logger().error(
      {
        workspaceId,
        broadcastId,
        error: e,
      },
      "Error resuming broadcast workflow",
    );
    throw e;
  }
}
