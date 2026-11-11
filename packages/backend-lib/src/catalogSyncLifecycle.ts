import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";

import {
  CATALOG_SYNC_SCHEDULER_WORKFLOW_ID,
  catalogSyncSchedulerWorkflow,
} from "./catalogSyncWorkflow";
import config from "./config";
import logger from "./logger";
import connectWorkflowClient from "./temporal/connectWorkflowClient";

/**
 * Starts the single global feed scheduler. Idempotent: a restart that finds the
 * workflow already running leaves it alone.
 */
export async function startCatalogSyncScheduler() {
  const client = await connectWorkflowClient();
  try {
    await client.start(catalogSyncSchedulerWorkflow, {
      taskQueue: config().globalCronTaskQueue,
      workflowId: CATALOG_SYNC_SCHEDULER_WORKFLOW_ID,
    });
    logger().info("Catalog sync scheduler started.");
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger().error({ err: e }, "Failed to start catalog sync scheduler.");
      throw e;
    }
    logger().info("Catalog sync scheduler already started.");
  }
}

export async function terminateCatalogSyncScheduler() {
  const client = await connectWorkflowClient();
  try {
    await client.getHandle(CATALOG_SYNC_SCHEDULER_WORKFLOW_ID).terminate();
    logger().info("Catalog sync scheduler terminated.");
  } catch (e) {
    logger().info({ err: e }, "Failed to terminate catalog sync scheduler.");
  }
}
