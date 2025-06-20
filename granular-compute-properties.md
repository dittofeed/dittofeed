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