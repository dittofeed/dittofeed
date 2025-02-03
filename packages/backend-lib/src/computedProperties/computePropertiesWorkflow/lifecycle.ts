import { WorkflowClient } from "@temporalio/client";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";

import config from "../../config";
import { GLOBAL_CRON_ID, globalCronWorkflow } from "../../globalCronWorkflow";
import logger from "../../logger";
import connectWorkflowClient from "../../temporal/connectWorkflowClient";
import {
  COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
  computePropertiesQueueWorkflow,
} from "../computePropertiesQueueWorkflow";
import {
  computePropertiesWorkflow,
  generateComputePropertiesId,
} from "../computePropertiesWorkflow";
import {
  COMPUTE_PROPERTIES_SCHEDULER_WORKFLOW_ID,
  computePropertiesSchedulerWorkflow,
} from "../comutePropertiesScheduler";

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

  try {
    await temporalClient.start(computePropertiesWorkflow, {
      taskQueue: config().computedPropertiesTaskQueue,
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
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger().info(
        {
          workspaceId,
        },
        "Compute properties workflow already started.",
      );
    }
  }
}

export async function startGlobalCron({
  client,
}: {
  client?: WorkflowClient;
} = {}) {
  const temporalClient = client ?? (await connectWorkflowClient());
  try {
    await temporalClient.start(globalCronWorkflow, {
      taskQueue: config().globalCronTaskQueue,
      cronSchedule: "*/5 * * * *",
      workflowId: GLOBAL_CRON_ID,
    });
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger().info("Global cron already started.");
    } else {
      logger().error(
        {
          err: e,
        },
        "Failed to start global cron.",
      );
    }
  }
}

export async function resetGlobalCron() {
  const client = await connectWorkflowClient();
  try {
    await client.getHandle(GLOBAL_CRON_ID).terminate();
  } catch (e) {
    logger().info(
      {
        err: e,
      },
      "Failed to terminate global cron.",
    );
  }
  try {
    await startGlobalCron({ client });
  } catch (e) {
    logger().error(
      {
        err: e,
      },
      "Failed to start global cron.",
    );
  }
}

export async function terminateComputePropertiesWorkflow({
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
    logger().info(
      {
        err: e,
      },
      "Failed to terminate compute properties workflow.",
    );
  }
}

export async function stopComputePropertiesWorkflow({
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
    logger().info(
      {
        err: e,
        workspaceId,
      },
      "Failed to stop compute properties workflow.",
    );
  }
}

export async function resetComputePropertiesWorkflow({
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
    logger().info(
      {
        err: e,
      },
      "Failed to terminate compute properties workflow.",
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
      "Failed to start compute properties workflow.",
    );
  }
}

export async function stopComputePropertiesWorkflowGlobal() {
  const client = await connectWorkflowClient();
  try {
    await client
      .getHandle(COMPUTE_PROPERTIES_SCHEDULER_WORKFLOW_ID)
      .terminate();
  } catch (e) {
    logger().error(
      {
        err: e,
      },
      "Failed to stop compute properties global workflow.",
    );
  }
  try {
    await client.getHandle(COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID).terminate();
  } catch (e) {
    logger().error(
      {
        err: e,
      },
      "Failed to stop compute properties global workflow.",
    );
  }
}

export async function startComputePropertiesWorkflowGlobal() {
  const client = await connectWorkflowClient();
  try {
    await client.start(computePropertiesSchedulerWorkflow, {
      taskQueue: config().computedPropertiesTaskQueue,
      workflowId: COMPUTE_PROPERTIES_SCHEDULER_WORKFLOW_ID,
      args: [
        {
          queueWorkflowId: COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
        },
      ],
    });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger().error(
        {
          err: e,
        },
        "Failed to start compute properties global workflow.",
      );
      throw e;
    }
    logger().info("Compute properties global workflow already started.");
  }
  try {
    await client.start(computePropertiesQueueWorkflow, {
      taskQueue: config().computedPropertiesTaskQueue,
      workflowId: COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
      args: [{}],
    });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger().error(
        {
          err: e,
        },
        "Failed to start compute properties queue workflow.",
      );
      throw e;
    }
    logger().info("Compute properties queue workflow already started.");
  }
}
