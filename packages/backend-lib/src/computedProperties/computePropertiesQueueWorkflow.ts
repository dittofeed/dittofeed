/* eslint-disable no-await-in-loop */
import {
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";

import type * as activities from "../temporal/activities";

//
// Activities proxy
//
const { computePropertiesContained } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 3 },
});

//
// SIGNAL & QUERY DEFINITIONS
//
export const addWorkspacesSignal = defineSignal<[string[]]>(
  "addWorkspacesSignal",
);
export const getQueueSizeQuery = defineQuery<number>("getQueueSizeQuery");

//
// PARAMS INTERFACE
//
export interface WorkQueueWorkflowParams {
  /**
   * Max number of items that the queue can hold at once (backpressure).
   */
  capacity: number;

  /**
   * Number of items to process in parallel per batch.
   */
  concurrency: number;

  /**
   * After how many batches of processing do we call `continueAsNew`?
   */
  maxLoopIterations: number;

  /**
   * (Optional) Current items in the queue (FIFO).
   * If `undefined`, we start with an empty queue.
   */
  queueState?: string[];

  /**
   * (Optional) Current membership set for deduplication.
   * If `undefined`, we start with an empty set.
   */
  membershipState?: string[];

  /**
   * (Optional) How many batches we’ve already processed in this run.
   * Defaults to 0 if not provided.
   */
  processedBatchCount?: number;
}

/**
 * WorkQueueWorkflow:
 * - Maintains a queue, with dedup, up to `capacity`.
 * - Processes items in batches of size `concurrency`.
 * - After `maxLoopIterations` batches, calls `continueAsNew`, passing along
 *   the current queue/membership so the next instance resumes where we left off.
 */
export async function WorkQueueWorkflow(params: WorkQueueWorkflowParams) {
  // 1) Rehydrate queue and membership from params (if provided).
  const queue: string[] = params.queueState ?? [];
  const membership = new Set<string>(params.membershipState ?? []);

  // 2) Start from a processedBatchCount or default to 0.
  let iterationCount = params.processedBatchCount ?? 0;

  //
  // SIGNAL HANDLER: Add new items, respecting capacity + dedup
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
  // QUERY HANDLER: Return current queue size
  //
  setHandler(getQueueSizeQuery, () => queue.length);

  //
  // MAIN LOOP
  //
  while (true) {
    // Process while we have items
    while (queue.length > 0) {
      // Take up to `concurrency` items
      const batch = queue.splice(0, params.concurrency);

      // Remove them from membership
      for (const item of batch) {
        membership.delete(item);
      }

      // Process them in parallel
      await Promise.all(
        batch.map((id) =>
          computePropertiesContained({
            workspaceId: id,
            now: Date.now(),
          }),
        ),
      );

      // Increment iteration count
      iterationCount += 1;

      // If we’ve reached maxLoopIterations, continue as new
      if (iterationCount >= params.maxLoopIterations) {
        // Prepare updated parameters for the next run
        const nextParams: WorkQueueWorkflowParams = {
          ...params,
          // Keep same capacity, concurrency, etc.
          // Pass the up-to-date queue/membership
          queueState: queue,
          membershipState: [...membership],
          // Reset the iteration count or pass it if you want an absolute total
          processedBatchCount: 0,
        };

        await continueAsNew<typeof WorkQueueWorkflow>(nextParams);
      }
    }

    // If queue empty, wait until we get new items via signal
    if (queue.length === 0) {
      await condition(() => queue.length > 0);
    }
  }
}
