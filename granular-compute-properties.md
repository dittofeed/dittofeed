# Granular Compute Properties

Dittofeed is an open-source customer engagement platform. We have different types of "resources", among which are:

- Segments: Process user events to assign a boolean value to a user, determining if they belong to a segment.
- User properties: Process user events to assign a JSON string value to a user, used to render dynamic content in messages.
- Journeys: Process user events to send messages to users.
- Integrations: Process user events send events and resource assignment values to external services.

Resources exist within a "workspace", which is our concept of a customer or tenant.

These resources are processed asynchronously, using the temporal workflow framework.

Computed properties are recalculated on a schedule using packages/backend-lib/src/computedProperties/computePropertiesWorkflow/activities/computePropertiesScheduler.ts. This workflow is responsible for finding the next workspace to process based on how long it's been since the last time it was processed. It then submits these workspaces to the computePropertiesQueueWorkflow for processing.

The queue workflow, found at packages/backend-lib/src/computedProperties/computePropertiesQueueWorkflow.ts, is responsible for processing the workspaces. It implements a priority queue, and uses a semaphore to limit the number of concurrent workspaces being processed.

