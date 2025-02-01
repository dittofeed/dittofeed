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

const { computePropertiesContained } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

/**
 * Parameters for the workflow
 */
export interface ComputePropertiesQueueWorkflowParams {
  capacity: number; // max items allowed in the queue
  concurrency: number; // max concurrency (max in-flight tasks)
  maxLoopIterations: number; // after how many processed items do we continueAsNew?

  /**
   * The current queue of workspace IDs (FIFO) carried across continueAsNew.
   * We'll infer membership from this queue at startup.
   */
  queueState?: string[];
}

/**
 * A workflow that:
 * - Maintains a queue (up to `capacity`).
 * - Uses a semaphore to allow up to `concurrency` tasks in flight.
 * - Avoids duplicates by also maintaining a `membership` set derived from the queue.
 * - Calls `continueAsNew` after `maxLoopIterations` processed items.
 */
export async function computePropertiesQueueWorkflow(
  params: ComputePropertiesQueueWorkflowParams,
) {
  // Rehydrate the queue from params or start fresh
  const queue: string[] = params.queueState ?? [];

  // Initialize a Set for membership deduplication, derived from the queue
  const membership = new Set<string>(queue);

  let totalProcessed = 0;
  const inFlight: Promise<void>[] = [];

  // Create a semaphore for concurrency control
  const semaphore = new Semaphore(params.concurrency);

  //
  // SIGNAL HANDLER: Add new workspaces
  //
  setHandler(addWorkspacesSignal, (workspaceIds: string[]) => {
    for (const w of workspaceIds) {
      if (queue.length < params.capacity && !membership.has(w)) {
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
  // MAIN LOOP
  //
  while (true) {
    // If we have items in the queue, process them
    while (queue.length > 0) {
      // Dequeue one item
      const workspaceId = queue.shift()!;
      membership.delete(workspaceId);

      // Acquire a semaphore slot
      await semaphore.acquire();

      // Fire-and-forget task (but track it in `inFlight`)
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      const task = (async () => {
        try {
          // Call the activity
          await computePropertiesContained({ workspaceId, now: Date.now() });
          totalProcessed += 1;
        } catch (err) {
          logger.error("Error processing workspace from queue", {
            workspaceId,
            err,
          });
        } finally {
          // Release the semaphore
          semaphore.release();
        }
      })();

      inFlight.push(task);

      // Check if we should continueAsNew
      if (totalProcessed >= params.maxLoopIterations) {
        // Wait for in-flight tasks to finish
        await Promise.allSettled(inFlight);

        // Prepare the next run
        const nextParams: ComputePropertiesQueueWorkflowParams = {
          ...params,
          // carry forward the remaining queue
          queueState: queue,
        };

        await continueAsNew<typeof computePropertiesQueueWorkflow>(nextParams);
      }
    }

    // If queue is empty, wait for more items
    if (queue.length === 0) {
      await condition(() => queue.length > 0);
    }
  }
}
