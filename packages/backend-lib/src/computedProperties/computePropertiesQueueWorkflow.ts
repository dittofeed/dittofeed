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

export interface WorkspaceQueueItem {
  id: string;
  priority?: number;
  maxPeriod?: number;
  insertedAt?: number; // Number representing insertion order
}

export interface WorkspaceQueueSignal {
  workspaces: WorkspaceQueueItem[];
}

// TODO handle this signal
export const addWorkspacesSignalV2 = defineSignal<[WorkspaceQueueSignal]>(
  "addWorkspacesSignalV2",
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
  // TODO handle
  queueStateV2?: WorkspaceQueueItem[];
}

/**
 * Comparator function for WorkspaceQueueItems that implements priority ordering:
 * 1. Higher priority (lower number) comes first
 * 2. Longer maxPeriod comes first
 * 3. Earlier insertion order comes first
 */
function compareWorkspaceItems(
  a: WorkspaceQueueItem,
  b: WorkspaceQueueItem,
): number {
  // First, compare by priority (undefined is lowest priority)
  if (a.priority !== undefined && b.priority === undefined) return -1;
  if (a.priority === undefined && b.priority !== undefined) return 1;
  if (a.priority !== undefined && b.priority !== undefined) {
    if (a.priority !== b.priority) return a.priority - b.priority;
  }

  // Next, compare by maxPeriod (undefined is lowest priority)
  if (a.maxPeriod !== undefined && b.maxPeriod === undefined) return -1;
  if (a.maxPeriod === undefined && b.maxPeriod !== undefined) return 1;
  if (a.maxPeriod !== undefined && b.maxPeriod !== undefined) {
    if (a.maxPeriod !== b.maxPeriod) return b.maxPeriod - a.maxPeriod;
  }

  // Finally, compare by insertion order
  if (a.insertedAt !== undefined && b.insertedAt !== undefined) {
    return a.insertedAt - b.insertedAt;
  }

  // If no insertedAt, fall back to string ID comparison
  return a.id.localeCompare(b.id);
}

/**
 * A single-loop streaming concurrency workflow that:
 * - Reads concurrency, capacity, maxLoopIterations from a config activity
 * - Maintains a priority queue of items (up to `capacity`)
 * - Uses a Semaphore to allow up to `concurrency` tasks in flight
 * - Processes one item per loop iteration (streaming approach)
 * - Calls `continueAsNew` after it has processed `maxLoopIterations` total items
 * - Deduplicates items that are currently in the queue
 */
export async function computePropertiesQueueWorkflow(
  params: ComputePropertiesQueueWorkflowParams,
) {
  // 1) Initialize priority queue from previous run (if any)
  const priorityQueue: WorkspaceQueueItem[] = [];
  const membership = new Set<string>();

  // Counter for tracking insertion order
  let insertionCounter = 0;

  // Handle backward compatibility with queueState (string array)
  if (params.queueState && params.queueState.length > 0) {
    for (const workspaceId of params.queueState) {
      if (workspaceId && !membership.has(workspaceId)) {
        const item: WorkspaceQueueItem = {
          id: workspaceId,
          priority: Number.MAX_SAFE_INTEGER, // Lowest priority
          maxPeriod: 0,
          insertedAt: insertionCounter, // Use counter for insertion order
        };
        priorityQueue.push(item);
        membership.add(workspaceId);
        insertionCounter += 1;
      }
    }
  }

  // Handle queueStateV2 (WorkspaceQueueItem array)
  if (params.queueStateV2 && params.queueStateV2.length > 0) {
    for (const item of params.queueStateV2) {
      if (item && item.id && !membership.has(item.id)) {
        // Preserve the insertedAt if it exists, otherwise assign a new one
        const queueItem: WorkspaceQueueItem = {
          id: item.id,
          priority: item.priority,
          maxPeriod: item.maxPeriod,
          insertedAt:
            item.insertedAt !== undefined ? item.insertedAt : insertionCounter,
        };
        priorityQueue.push(queueItem);
        membership.add(item.id);
        insertionCounter += 1;
      }
    }
  }

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
  // SIGNAL HANDLER: Add new workspaces (backward compatible)
  //
  setHandler(addWorkspacesSignal, (workspaceIds: string[]) => {
    logger.info("Queue: Adding new workspaces (legacy signal)", {
      workspaceIdsCount: workspaceIds.length,
    });

    for (const id of workspaceIds) {
      if (id && priorityQueue.length < capacity && !membership.has(id)) {
        const item: WorkspaceQueueItem = {
          id,
          priority: Number.MAX_SAFE_INTEGER, // Lowest priority
          maxPeriod: 0,
          insertedAt: insertionCounter, // Use counter for insertion order
        };
        priorityQueue.push(item);
        membership.add(id);
        insertionCounter += 1;
      }
    }
  });

  //
  // SIGNAL HANDLER: Add new workspace queue items
  //
  setHandler(addWorkspacesSignalV2, (signal: WorkspaceQueueSignal) => {
    logger.info("Queue: Adding new workspaces (v2 signal)", {
      workspaceIdsCount: signal.workspaces.length,
    });

    for (const item of signal.workspaces) {
      if (priorityQueue.length < capacity && !membership.has(item.id)) {
        const queueItem: WorkspaceQueueItem = {
          id: item.id,
          priority: item.priority,
          maxPeriod: item.maxPeriod,
          insertedAt: insertionCounter, // Use counter for insertion order
        };
        priorityQueue.push(queueItem);
        membership.add(item.id);
        insertionCounter += 1;
      }
    }
  });

  //
  // QUERY HANDLER: Return how many items are in the queue
  //
  setHandler(getQueueSizeQuery, () => priorityQueue.length);

  //
  // MAIN LOOP (streaming concurrency approach)
  //
  while (true) {
    // A) If the queue is empty, wait for at least one item
    if (priorityQueue.length === 0) {
      await condition(() => priorityQueue.length > 0);
      // Once unblocked, we know there's an item now.
    }

    // B) Sort and dequeue the highest priority item
    priorityQueue.sort(compareWorkspaceItems);
    const item = priorityQueue.shift()!;
    membership.delete(item.id);

    logger.info("Queue: Dequeued workspace", {
      workspaceId: item.id,
      priority: item.priority,
      maxPeriod: item.maxPeriod,
      queueSize: priorityQueue.length,
    });

    // C) Acquire a semaphore slot to respect concurrency
    await semaphore.acquire();

    logger.info("Queue: Acquired semaphore slot", {
      workspaceId: item.id,
    });

    // D) Launch the activity in a background task
    const task = (async () => {
      try {
        await computePropertiesContained({
          workspaceId: item.id,
          now: Date.now(),
        });
        totalProcessed += 1;
        logger.info("Queue: Processed workspace", {
          workspaceId: item.id,
        });
      } catch (err) {
        logger.error("Error processing workspace from queue", {
          workspaceId: item.id,
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

      // Prepare next run with the V2 queue state
      const nextParams: ComputePropertiesQueueWorkflowParams = {
        queueStateV2: priorityQueue,
      };
      logger.info("Reached maxLoopIterations, continuing as new", {
        totalProcessed,
        nextQueueSize: priorityQueue.length,
      });

      await continueAsNew<typeof computePropertiesQueueWorkflow>(nextParams);
    }
  }
}
