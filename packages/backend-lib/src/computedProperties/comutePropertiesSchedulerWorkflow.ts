/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-await-in-loop */
import {
  continueAsNew,
  getExternalWorkflowHandle,
  LoggerSinks,
  proxyActivities,
  proxySinks,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "../temporal/activities";
import { addWorkspacesSignal } from "./computePropertiesQueueWorkflow";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export const COMPUTE_PROPERTIES_SCHEDULER_WORKFLOW_ID =
  "compute-properties-scheduler-workflow";

//
// Activities proxy
//
const { findDueWorkspaces, getQueueSize, config } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "1 minute",
});

export interface ComputePropertiesSchedulerWorkflowParams {
  /**
   * The Workflow ID of the running queue workflow we want to signal.
   */
  queueWorkflowId: string;
}

/**
 * A scheduler workflow that:
 *  - Periodically checks how many items are in the queue.
 *  - If below `maxQueueSize`, calls `findDueWorkspaces` and signals the queue with new work.
 *  - Sleeps for `pollIntervalMs` and repeats.
 *  - Calls `continueAsNew` after `maxPollIterations` polls to avoid unbounded history.
 */
export async function computePropertiesSchedulerWorkflow(
  params: ComputePropertiesSchedulerWorkflowParams,
) {
  // 1. Get a handle to the external queue workflow
  const queueWf = getExternalWorkflowHandle(params.queueWorkflowId);

  // 2. Rehydrate iteration count or default to 0
  let iterationCount = 0;

  const {
    computePropertiesQueueCapacity,
    computePropertiesAttempts,
    computePropertiesSchedulerInterval,
  } = await config([
    "computePropertiesQueueCapacity",
    "computePropertiesAttempts",
    "computePropertiesSchedulerInterval",
  ]);

  logger.info("Scheduler: Loaded config", {
    computePropertiesQueueCapacity,
    computePropertiesAttempts,
    computePropertiesSchedulerInterval,
  });

  // 3. Main poll loop
  while (true) {
    // (A) Query how many items are in the queue
    const size = await getQueueSize();

    // (B) If there's room, poll for new items
    if (size < computePropertiesQueueCapacity) {
      logger.info("Scheduler: Found room in the queue, polling for new items", {
        size,
        computePropertiesQueueCapacity,
      });
      const dueWorkspaces = await findDueWorkspaces({
        now: Date.now(),
      });

      logger.info("Scheduler: Found due workspaces", {
        workspaceIdsCount: dueWorkspaces.workspaceIds.length,
      });

      if (dueWorkspaces.workspaceIds.length > 0) {
        logger.debug("Scheduler: Signaling queue workflow with new items", {
          workspaceId: dueWorkspaces.workspaceIds,
        });
        // (C) Signal the queue workflow with new items
        await queueWf.signal(addWorkspacesSignal, dueWorkspaces.workspaceIds);
      }
    } else {
      logger.info("Scheduler: No room in the queue", {
        size,
        computePropertiesQueueCapacity,
      });
    }

    // (D) Increment our iteration count
    iterationCount += 1;

    // (E) Check if we should continueAsNew
    if (iterationCount >= computePropertiesAttempts) {
      logger.info("Scheduler: Reached max attempts, continuingAsNew", {
        iterationCount,
        computePropertiesAttempts,
      });
      // Prepare for the next "generation" of this workflow
      // Reset currentIterationCount or carry it forward as you prefer:
      await continueAsNew<typeof computePropertiesSchedulerWorkflow>({
        ...params,
      });
    }

    logger.info("Scheduler: Sleeping until next poll", {
      iterationCount,
      computePropertiesAttempts,
      computePropertiesSchedulerInterval,
    });

    // (F) Sleep until the next poll
    await sleep(computePropertiesSchedulerInterval);
  }
}
