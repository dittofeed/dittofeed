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

const { computePropertiesContained } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

/** Parameters for the workflow */
export interface ComputePropertiesQueueWorkflowParams {
  capacity: number; // max items in queue
  concurrency: number; // max concurrency
  maxLoopIterations: number; // how many items processed before continueAsNew
  queueState?: string[];
  membershipState?: string[];
}

export async function computePropertiesQueueWorkflow(
  params: ComputePropertiesQueueWorkflowParams,
) {
  // Rehydrate queue + membership
  const queue: string[] = params.queueState ?? [];
  const membership = new Set<string>(params.membershipState ?? []);

  let totalProcessed = 0;
  const inFlight: Promise<void>[] = [];

  // Create our semaphore for concurrency
  const semaphore = new Semaphore(params.concurrency);

  // Signal handler: add items to queue (deduplicated, up to capacity)
  setHandler(addWorkspacesSignal, (workspaceIds: string[]) => {
    for (const w of workspaceIds) {
      if (queue.length < params.capacity && !membership.has(w)) {
        queue.push(w);
        membership.add(w);
      }
    }
  });

  // Query handler: return how many items are currently in the queue
  setHandler(getQueueSizeQuery, () => queue.length);

  while (true) {
    // While there are items in the queue...
    while (queue.length > 0) {
      // Dequeue the next item
      const workspaceId = queue.shift()!;
      membership.delete(workspaceId);

      // Acquire the semaphore slot
      await semaphore.acquire();

      // Start an async function that does the work and releases the semaphore
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      const task = (async function processWorkpsace() {
        try {
          // 1) Call the activity
          await computePropertiesContained({ workspaceId, now: Date.now() });

          // 2) Increment total processed
          // eslint-disable-next-line no-plusplus
          totalProcessed++;
        } catch (err) {
          // If you want to handle the error or retry logic here, do so.
          // In many cases you rely on the activity's built-in retry policies.
          logger.error("Error processing workspace from queue", {
            workspaceId,
            err,
          });
        } finally {
          // Always release the semaphore, whether success or error
          semaphore.release();
        }
      })();

      // Save the Promise so we can await later
      inFlight.push(task);

      // If we've processed enough items, continueAsNew
      if (totalProcessed >= params.maxLoopIterations) {
        // Wait for all currently in-flight tasks to finish or fail
        await Promise.allSettled(inFlight);

        const nextParams: ComputePropertiesQueueWorkflowParams = {
          ...params,
          // Carry forward what's left in the queue
          queueState: queue,
          membershipState: [...membership],
        };

        await continueAsNew<typeof computePropertiesQueueWorkflow>(nextParams);
      }
    }

    // If queue is empty, wait until queue has new items
    if (queue.length === 0) {
      await condition(() => queue.length > 0);
    }
  }
}
