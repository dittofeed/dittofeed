/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable no-await-in-loop */
import {
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  LoggerSinks,
  patched,
  proxyActivities,
  proxySinks,
  setHandler,
} from "@temporalio/workflow";

import type * as activities from "../temporal/activities";
import { Semaphore } from "../temporal/semaphore";
import { WorkspaceQueueItem } from "../types";
import { generateKeyFromItem, getWorkspaceIdFromItem } from "./queueUtils";

export const COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID =
  "compute-properties-queue-workflow";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export const addWorkspacesSignal = defineSignal<[string[]]>(
  "addWorkspacesSignal",
);

export interface WorkspaceQueueSignal {
  workspaces: WorkspaceQueueItem[];
}

export const addWorkspacesSignalV2 = defineSignal<[WorkspaceQueueSignal]>(
  "addWorkspacesSignalV2",
);

export const getQueueSizeQuery = defineQuery<number>("getQueueSizeQuery");

export interface QueueState {
  priorityQueue: WorkspaceQueueItem[];
  membership: string[];
  inFlightTaskIds: string[];
  totalProcessed: number;
}

export const getQueueStateQuery = defineQuery<QueueState>("getQueueStateQuery");

/**
 * Activities
 */
const { config } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minutes",
});

export interface ComputePropertiesQueueWorkflowParams {
  queueState?: string[];
  // TODO handle
  queueStateV2?: WorkspaceQueueItem[];
  continueAsNew?: boolean;
}

interface InFlightTask {
  task: Promise<void>;
  key: string;
}

/**
 * Comparator function for WorkspaceQueueItems that implements priority ordering:
 * 1. Higher priority (higher number) comes first
 * 2. Longer maxPeriod comes first
 * 3. Earlier insertion order comes first
 */
export function compareWorkspaceItems(
  a: WorkspaceQueueItem,
  b: WorkspaceQueueItem,
): number {
  // First, compare by priority (undefined is lowest priority)
  if (a.priority !== undefined && b.priority === undefined) return -1;
  if (a.priority === undefined && b.priority !== undefined) return 1;
  if (a.priority !== undefined && b.priority !== undefined) {
    if (a.priority !== b.priority) return b.priority - a.priority; // Reverse the order so higher numbers come first
  }

  // Next, compare by maxPeriod (undefined comes FIRST)
  if (a.maxPeriod === undefined && b.maxPeriod !== undefined) return -1; // a (undefined) comes first
  if (a.maxPeriod !== undefined && b.maxPeriod === undefined) return 1; // b (undefined) comes first
  if (a.maxPeriod !== undefined && b.maxPeriod !== undefined) {
    // If both are defined, longer maxPeriod comes first
    if (a.maxPeriod !== b.maxPeriod) return a.maxPeriod - b.maxPeriod;
  }

  // Finally, compare by insertion order
  if (a.insertedAt !== undefined && b.insertedAt !== undefined) {
    return a.insertedAt - b.insertedAt;
  }

  const aKey = generateKeyFromItem(a);
  const bKey = generateKeyFromItem(b);
  // If no insertedAt, fall back to string key comparison
  return aKey.localeCompare(bKey);
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

  // Handle backward compatibility with queueState (string array)
  if (params.queueState && params.queueState.length > 0) {
    const now = Date.now();
    for (const workspaceId of params.queueState) {
      const key = generateKeyFromItem({ id: workspaceId });
      if (workspaceId && !membership.has(key)) {
        const item: WorkspaceQueueItem = {
          id: workspaceId,
          insertedAt: now, // Use current timestamp
        };
        priorityQueue.push(item);
        membership.add(key);
      }
    }
  }

  // Handle queueStateV2 (WorkspaceQueueItem array)
  if (params.queueStateV2 && params.queueStateV2.length > 0) {
    for (const item of params.queueStateV2) {
      const key = generateKeyFromItem(item);
      if (!membership.has(key)) {
        priorityQueue.push(item);
        membership.add(key);
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

  const { computePropertiesContained, computePropertiesContainedV2 } =
    proxyActivities<typeof activities>({
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
  const inFlight: InFlightTask[] = [];

  //
  // SIGNAL HANDLER: Add new workspaces (backward compatible)
  //
  setHandler(addWorkspacesSignal, (workspaceIds: string[]) => {
    logger.info("Queue: Adding new workspaces (legacy signal)", {
      workspaceIdsCount: workspaceIds.length,
    });

    const now = Date.now();
    for (const id of workspaceIds) {
      const key = generateKeyFromItem({ id });
      if (id && priorityQueue.length < capacity && !membership.has(key)) {
        const queueItem: WorkspaceQueueItem = {
          id,
          insertedAt: now, // Use timestamp
        };
        priorityQueue.push(queueItem);
        membership.add(generateKeyFromItem(queueItem));
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
      const key = generateKeyFromItem(item);
      if (priorityQueue.length < capacity && !membership.has(key)) {
        priorityQueue.push(item);
        membership.add(key);
      }
    }
  });

  //
  // QUERY HANDLER: Return how many items are in the queue
  //
  setHandler(getQueueSizeQuery, () => priorityQueue.length);

  //
  // QUERY HANDLER: Return detailed queue state
  //
  setHandler(
    getQueueStateQuery,
    (): QueueState => ({
      priorityQueue,
      membership: Array.from(membership),
      inFlightTaskIds: inFlight.map((task) => task.key),
      totalProcessed,
    }),
  );

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
    const key = generateKeyFromItem(item);
    const workspaceId = getWorkspaceIdFromItem(item);

    logger.info("Queue: Dequeued workspace item", {
      workspaceId,
      key,
      priority: item.priority,
      maxPeriod: item.maxPeriod,
      queueSize: priorityQueue.length,
    });

    // C) Acquire a semaphore slot to respect concurrency
    await semaphore.acquire();

    membership.delete(key);

    logger.info("Queue: Acquired semaphore slot", {
      workspaceId,
      key,
    });

    // D) Launch the activity in a background task
    const taskPromise = (async () => {
      try {
        if (patched("computePropertiesContainedV2")) {
          const now = Date.now();
          const newItems = await computePropertiesContainedV2({
            item,
            now,
          });

          if (newItems) {
            for (const newItem of newItems) {
              const newKey = generateKeyFromItem(newItem);
              if (priorityQueue.length < capacity && !membership.has(newKey)) {
                priorityQueue.push(newItem);
                membership.add(newKey);
              }
            }
          }
        } else {
          await computePropertiesContained({
            workspaceId,
            now: Date.now(),
          });
        }
        totalProcessed += 1;
        logger.info("Queue: Processed workspace item", {
          key,
        });
      } catch (err) {
        logger.error("Error processing workspace item from queue", {
          key,
          err,
        });
      } finally {
        inFlight.splice(
          inFlight.findIndex((t) => t.key === key),
          1,
        );
        semaphore.release();
      }
    })();
    inFlight.push({ task: taskPromise, key });

    // E) Check if we've processed enough items to continueAsNew
    if (totalProcessed >= maxLoopIterations) {
      // Wait for all in-flight tasks to settle
      await Promise.allSettled(inFlight.map((t) => t.task));

      // Prepare next run with the V2 queue state
      const nextParams: ComputePropertiesQueueWorkflowParams = {
        queueStateV2: priorityQueue,
      };
      logger.info("Reached maxLoopIterations, continuing as new", {
        totalProcessed,
        nextQueueSize: priorityQueue.length,
      });

      const shouldContinueAsNew = params.continueAsNew !== false;
      if (shouldContinueAsNew) {
        await continueAsNew<typeof computePropertiesQueueWorkflow>(nextParams);
      }
    }
  }
}
