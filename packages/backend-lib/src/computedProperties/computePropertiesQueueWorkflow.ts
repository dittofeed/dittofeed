/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable no-await-in-loop */
import {
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  LoggerSinks,
  proxyActivities,
  proxySinks,
  setHandler,
} from "@temporalio/workflow";

import type * as activities from "../temporal/activities";
import { Semaphore } from "../temporal/semaphore";

export const COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID =
  "compute-properties-queue-workflow";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export const addWorkspacesSignal = defineSignal<[string[]]>(
  "addWorkspacesSignal",
);

export const getQueueSizeQuery = defineQuery<number>("getQueueSizeQuery");

/**
 * Activities
 */
const { config } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minutes",
});

/**
 * The workflow parameters now only include `queueState`.
 * We no longer accept concurrency, capacity, or maxLoopIterations from params;
 * instead, we pull those from the `config` activity at runtime.
 */
export interface ComputePropertiesQueueWorkflowParams {
  /**
   * The current queue of workspace IDs (FIFO) carried across `continueAsNew`.
   * We'll infer membership from this queue at startup.
   */
  queueState?: string[];
}

/**
 * A single-loop streaming concurrency workflow that:
 * - Reads concurrency, capacity, maxLoopIterations from a config activity
 * - Maintains a queue of items (up to `capacity`)
 * - Uses a Semaphore to allow up to `concurrency` tasks in flight
 * - Processes one item per loop iteration (streaming approach)
 * - Calls `continueAsNew` after it has processed `maxLoopIterations` total items
 * - Deduplicates items that are currently in the queue
 */
export async function computePropertiesQueueWorkflow(
  params: ComputePropertiesQueueWorkflowParams,
) {
  // 1) Rehydrate the queue from previous run (if any)
  const queue: string[] = params.queueState ?? [];

  // 2) Initialize a Set to avoid duplicates in the queue
  const membership = new Set<string>(queue);

  // 3) Load concurrency, capacity, and maxLoopIterations from config
  const initialConfig = await config([
    "computePropertiesQueueConcurrency",
    "computePropertiesQueueCapacity",
    "computePropertiesAttempts",
    "computedPropertiesActivityTaskQueue",
  ]);
  const concurrency = initialConfig.computePropertiesQueueConcurrency;
  const capacity = initialConfig.computePropertiesQueueCapacity;
  const maxLoopIterations = initialConfig.computePropertiesAttempts;

  const { computePropertiesContained } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    taskQueue: initialConfig.computedPropertiesActivityTaskQueue,
  });

  logger.info("Loaded config values", {
    concurrency,
    capacity,
    maxLoopIterations,
    taskQueue: initialConfig.computedPropertiesActivityTaskQueue,
  });

  // 4) Create a semaphore for concurrency
  const semaphore = new Semaphore(concurrency);

  // We'll track how many items we've processed in this run
  let totalProcessed = 0;
  // Keep track of in-flight tasks so we can wait before continueAsNew
  const inFlight: Promise<void>[] = [];

  //
  // SIGNAL HANDLER: Add new workspaces (up to capacity, no duplicates)
  //
  setHandler(addWorkspacesSignal, (workspaceIds: string[]) => {
    for (const w of workspaceIds) {
      if (queue.length < capacity && !membership.has(w)) {
        queue.push(w);
        membership.add(w);
      }
    }
  });

  //
  // QUERY HANDLER: Return how many items are in the queue
  //
  setHandler(getQueueSizeQuery, () => queue.length);

  //
  // MAIN LOOP (streaming concurrency approach)
  //
  while (true) {
    // A) If the queue is empty, wait for at least one item
    if (queue.length === 0) {
      await condition(() => queue.length > 0);
      // Once unblocked, we know there's an item now.
    }

    // B) Dequeue a single item (we handle one item per iteration)
    const workspaceId = queue.shift()!;
    membership.delete(workspaceId);

    // C) Acquire a semaphore slot to respect concurrency
    await semaphore.acquire();

    // D) Launch the activity in a background task
    const task = (async () => {
      try {
        await computePropertiesContained({ workspaceId, now: Date.now() });
        totalProcessed += 1;
      } catch (err) {
        logger.error("Error processing workspace from queue", {
          workspaceId,
          err,
        });
      } finally {
        semaphore.release();
      }
    })();
    inFlight.push(task);

    // E) Check if we've processed enough items to continueAsNew
    if (totalProcessed >= maxLoopIterations) {
      // Wait for all in-flight tasks to settle
      await Promise.allSettled(inFlight);

      // Prepare next run
      const nextParams: ComputePropertiesQueueWorkflowParams = {
        queueState: queue, // carry forward leftover items
      };
      logger.info("Reached maxLoopIterations, continuing as new", {
        totalProcessed,
        nextParams,
      });

      await continueAsNew<typeof computePropertiesQueueWorkflow>(nextParams);
    }
  }
}
