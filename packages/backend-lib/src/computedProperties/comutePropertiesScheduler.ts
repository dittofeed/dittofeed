/* eslint-disable no-await-in-loop */
// workflows/scheduler.ts

import {
  getExternalWorkflowHandle,
  proxyActivities,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "../temporal/activities";
import {
  addWorkspacesSignal,
  getQueueSizeQuery,
} from "./computePropertiesQueueWorkflow";

//
// Activities proxy
//
const { findDueWorkspaces, getQueueSize } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

/**
 * computePropertiesSchedulerWorkflow:
 *
 * @param queueWorkflowId The ID of the running WorkQueueWorkflow to signal.
 * @param T               How often (in ms) to poll for due work (e.g. 60_000 ms).
 * @param N               The maximum queue size (for checking capacity).
 */
export async function computePropertiesSchedulerWorkflow(
  queueWorkflowId: string,
  T: number,
  N: number,
) {
  // Get a handle to the external queue workflow
  const queueWf = getExternalWorkflowHandle(queueWorkflowId);

  while (true) {
    // 1. Check how many items are in the queue
    const size = await getQueueSize();

    // 2. Only poll for new items if there's space
    if (size < N) {
      const dueWorkspaces = await findDueWorkspaces({
        now: Date.now(),
      });
      if (dueWorkspaces.workspaceIds.length) {
        // 3. Signal the queue workflow with new items
        await queueWf.signal(addWorkspacesSignal, dueWorkspaces.workspaceIds);
      }
    }

    // 4. Sleep for T milliseconds before checking again
    await sleep(T);
  }
}
