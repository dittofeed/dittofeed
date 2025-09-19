/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-await-in-loop */
import {
  continueAsNew,
  getExternalWorkflowHandle,
  LoggerSinks,
  proxyActivities,
  proxySinks,
  sleep,
  WorkflowNotFoundError,
} from "@temporalio/workflow";

import { addWorkspacesSignalV2 } from "./computePropertiesQueueWorkflow";
import type * as activities from "./computePropertiesWorkflow/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export const COMPUTE_PROPERTIES_SCHEDULER_WORKFLOW_ID =
  "compute-properties-scheduler-workflow";

//
// Activities proxy
//
const { findDueWorkspacesV3, getQueueSize, config } = proxyActivities<
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
    computePropertiesSchedulerQueueRestartDelay,
  } = await config([
    "computePropertiesQueueCapacity",
    "computePropertiesAttempts",
    "computePropertiesSchedulerInterval",
    "computePropertiesSchedulerQueueRestartDelay",
  ]);

  logger.info("Scheduler: Loaded config", {
    computePropertiesQueueCapacity,
    computePropertiesAttempts,
    computePropertiesSchedulerInterval,
    computePropertiesSchedulerQueueRestartDelay,
  });

  // 3. Main poll loop
  while (true) {
    let skipSchedulerIntervalSleep = false;
    // (A) Query how many items are in the queue
    const size = await getQueueSize();

    // (B) If there's room, poll for new items
    if (size < computePropertiesQueueCapacity) {
      logger.info("Scheduler: Found room in the queue, polling for new items", {
        size,
        computePropertiesQueueCapacity,
      });
      const dueWorkspaces = await findDueWorkspacesV3({
        now: Date.now(),
      });

      logger.info("Scheduler: Found due workspaces", {
        workspaceIdsCount: dueWorkspaces.workspaces.length,
      });

      if (dueWorkspaces.workspaces.length > 0) {
        logger.debug("Scheduler: Signaling queue workflow with new items", {
          workspaceIds: dueWorkspaces.workspaces.map((w) => w.id),
        });
        // (C) Signal the queue workflow with new items
        try {
          await queueWf.signal(addWorkspacesSignalV2, {
            workspaces: dueWorkspaces.workspaces.map((w) => ({
              id: w.id,
              period: w.minPeriod,
            })),
          });
        } catch (err) {
          if (err instanceof WorkflowNotFoundError) {
            logger.info("Scheduler: Queue workflow not found, retrying after delay", {
              delayMs: computePropertiesSchedulerQueueRestartDelay,
            });
            skipSchedulerIntervalSleep = true;
            await sleep(computePropertiesSchedulerQueueRestartDelay);
          } else {
            throw err;
          }
        }
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

    if (skipSchedulerIntervalSleep) {
      logger.info("Scheduler: Skipping poll sleep after queue restart delay", {
        iterationCount,
        delayMs: computePropertiesSchedulerQueueRestartDelay,
      });
      continue;
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
