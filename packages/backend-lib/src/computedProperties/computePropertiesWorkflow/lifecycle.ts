import { WorkflowClient } from "@temporalio/client";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";

import config from "../../config";
import { GLOBAL_CRON_ID, globalCronWorkflow } from "../../globalCronWorkflow";
import logger from "../../logger";
import connectWorkflowClient from "../../temporal/connectWorkflowClient";
import {
  computePropertiesWorkflow,
  generateComputePropertiesId,
} from "../computePropertiesWorkflow";
import {
  COMPUTE_PROPERTIES_WORKFLOW_GLOBAL_ID,
  computePropertiesWorkflowGlobal,
} from "../computePropertiesWorkflowGlobal";

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
      taskQueue: "default",
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
      taskQueue: "default",
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

export async function startComputePropertiesWorkflowGlobal() {
  const client = await connectWorkflowClient();
  try {
    await client.start(computePropertiesWorkflowGlobal, {
      taskQueue: "default",
      workflowId: COMPUTE_PROPERTIES_WORKFLOW_GLOBAL_ID,
      args: [{}],
    });
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger().info("Compute properties global workflow already started.");
    } else {
      logger().error(
        {
          err: e,
        },
        "Failed to start compute properties global workflow.",
      );
    }
  }
}
