import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
} from "@temporalio/common";

import { markBroadcastStatus } from "../broadcasts";
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
    if (e instanceof WorkflowNotFoundError) {
      logger().info(
        {
          workspaceId,
          broadcastId,
          err: e,
        },
        "Broadcast workflow not found while pausing; updating status directly",
      );
      await markBroadcastStatus({
        workspaceId,
        broadcastId,
        status: "Paused",
      });
      return;
    }
    logger().error(
      {
        workspaceId,
        broadcastId,
        err: e,
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
    if (e instanceof WorkflowNotFoundError) {
      logger().info(
        {
          workspaceId,
          broadcastId,
          err: e,
        },
        "Broadcast workflow not found while resuming; updating status directly",
      );
      await markBroadcastStatus({
        workspaceId,
        broadcastId,
        status: "Running",
      });
      return;
    }
    logger().error(
      {
        workspaceId,
        broadcastId,
        err: e,
      },
      "Error resuming broadcast workflow",
    );
    throw e;
  }
}

export async function cancelBroadcast({
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
      "Cancelling broadcast workflow",
    );
    const handle = client.getHandle(
      generateBroadcastWorkflowV2Id({
        workspaceId,
        broadcastId,
      }),
    );
    await handle.signal("CancelBroadcast");
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      logger().info(
        {
          workspaceId,
          broadcastId,
          err: e,
        },
        "Broadcast workflow not found while cancelling; updating status directly",
      );
      await markBroadcastStatus({
        workspaceId,
        broadcastId,
        status: "Cancelled",
      });
      return;
    }
    logger().error(
      {
        workspaceId,
        broadcastId,
        err: e,
      },
      "Error cancelling broadcast workflow",
    );
    throw e;
  }
}
