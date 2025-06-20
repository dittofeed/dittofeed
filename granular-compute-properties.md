# Granular Compute Properties

## Overview

Dittofeed is an open-source customer engagement platform. We have different types of "resources", among which are:

- Segments: Process user events to assign a boolean value to a user, determining if they belong to a segment.
- User properties: Process user events to assign a JSON string value to a user, used to render dynamic content in messages.
- Journeys: Process user events to send messages to users.
- Integrations: Process user events send events and resource assignment values to external services.

Resources exist within a "workspace", which is our concept of a customer or tenant. Segments and user properties are termed "computed properties" in the codebase (a subcategory of resources).

These resources are processed asynchronously, using the temporal workflow framework.

Computed properties are recalculated on a schedule using packages/backend-lib/src/computedProperties/computePropertiesWorkflow/activities/computePropertiesScheduler.ts. This workflow is responsible for finding the next workspace to process based on how long it's been since the last time it was processed. It then submits these workspaces to the computePropertiesQueueWorkflow for processing.

The queue workflow, found at packages/backend-lib/src/computedProperties/computePropertiesQueueWorkflow.ts, is responsible for processing the workspaces. It implements a priority queue, and uses a semaphore to limit the number of concurrent workspaces being processed.

Our semaphore does a good job at limiting the amount of concurrent work being done, but it's not perfect. It works well when the amount of work is split relatively evenly across workspaces, but it's not great when a single workspace has a lot of work to do.

As background knowledge, know that we implement a kind of "micro-batching" when re-computing computed properties. We keep track of the last time a computed property was processed for a workspace, and only do work on the new events since the last time it was processed. We utilize ClickHouse, and its AggregatingMergeTree engine, to incrementally compute the computed properties in micro-batches.

We're going to address this in two ways:

- Assess the number of events in the processing window, and the number of computed properties that need to be re-computed for a workspace.
- Set some threshold for the number of events x properties that we're willing to process in a single batch.
- If the number of events x properties is greater than the threshold, we'll split the work into multiple batches, using the new computePropertiesContainedV2 method to return the split items, where those split items will be re-submitted back to the queue at the top so that they're processed immediately.

## Implementation

### High-level tasks (execution order)

- [ ] **Extend queue item types & priorities (foundation)**
  - Confirm/extend definitions in `packages/backend-lib/src/types.ts` for:
    - `EntireWorkspaceQueueItem` (represents full workspace job).
    - `IndividualComputedPropertyQueueItem` (represents one segment / user-property / journey / integration).
  - Ensure each queue item has `insertedAt`, `priority`, and optional `maxPeriod`.
  - All computed properties are prioritised **equally**; we will simply inherit the parent workspace's priority when splitting.

- [ ] **Introduce configuration for granular batching**
  - Add `computePropertiesBatchThreshold` (maximum `events × properties` allowed in a single batch) to `packages/backend-lib/src/config` and expose via env/helm values.
  - **Default:** start with `500_000` (half-million) as a reasonable midpoint within the "hundreds-of-thousands to several-million" guidance; operators can tune per-deployment.
  - Wire this value into Temporal activities through the existing `config` activity so it is available inside `computePropertiesContainedV2` and the queue workflow.

- [ ] **Update `computePropertiesQueueWorkflow.ts` (plumbing & fairness)**
  - Inside the `patched("computePropertiesContainedV2")` branch:
    1. Call the V2 activity with the dequeued `WorkspaceQueueItem`.
    2. If the result is an array, push those items onto `priorityQueue` **before** normal items (use priority to ensure that the split items are processed before the normal items) and add ids to `membership`.
    3. If `null`, treat as completed (same as v1).
  - Replace the simple workspaceId membership Set with a composite-key approach:
    - Implement `generateKeyFromItem(item)` → returns e.g. ``${item.type ?? "Workspace"}:${item.id}``.
    - Use this key whenever adding to / checking the `membership` set so that split items (same workspace, different property) are tracked distinctly.
  - Ensure new item types are handled by `compareWorkspaceItems`.
  - Keep legacy path intact for rollback.

- [ ] **Add targeted computation helpers**
  - Provide helper that runs `computePropertiesIncremental` while restricting to a single segment / user-property etc. (`computePropertiesIndividual`).
  - Used by V2 when processing `IndividualComputedPropertyQueueItem`s.

- [ ] **Implement `computePropertiesContainedV2`**
  - Signature: `({ item, now }): Promise<IndividualComputedPropertyQueueItem[] | null>`.
  - Steps:
    1. If `item.type` ≠ `Workspace`, immediately delegate to specialised computation (segment / user property / …) and return `null`.
    2. For a workspace-level item:
       a. Fetch incremental arguments via `computePropertiesIncrementalArgs`.
       b. Calculate `numEvents` in the window since the last processed timestamp for each property.
       c. Compute `workload = numEvents × totalProperties`.
       d. If `workload ≤ threshold`, invoke `computePropertiesIncremental` (same as v1) and return `null`.
       e. Otherwise split the work (journeys & integrations remain full-workspace jobs):
          • Produce an `IndividualComputedPropertyQueueItem` *only* for segments and user-properties that still need work, copying `priority`/`insertedAt` from the parent item.
          • Return this array so the queue can push it back for immediate processing.

- [ ] **Enhance `computePropertiesScheduler`**
  - Create a new activity, `findDueWorkspacesV3`. This should use a new method, `findDueWorkspaceMinTos`, which will return a list workspaces, sorted by the minimum time of the last processed computed property for that workspace.
  - This change will allow us to re-process individual computed properties, without delaying the processing of other computed properties in the workspace.
  - It should be careful to not include segments and user properties which don't have the running status.
  - We should write new tests in `packages/backend-lib/src/computedProperties/periods.test.ts`.

- [ ] **Testing**
  - Implement new cases in `packages/backend-lib/src/computedProperties/computePropertiesQueueWorkflow.test.ts`

### Status of previous open questions (resolved)

1. **Default threshold** – use `500 000` by default; configurable.
2. **Further slicing of event window** – not required for this phase.
3. **Per-property prioritisation** – unnecessary; treat uniformly.
4. **Journeys & integrations** – remain full-workspace jobs for now.