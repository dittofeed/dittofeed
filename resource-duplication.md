# Resource Duplication

Our goal is to enable the duplication of Dittofeed's resources from the UI and API. Duplicated resources should have the same definition, but with different names.

Relevant resources include:

- Segments
- Message Templates
- Journeys
- Broadcasts

## Steps

### Create a new Resources method

Create a new method in `packages/backend-lib/src/resources.ts`. Create a new test file in `packages/backend-lib/src/resources.ts` to accompany this method. After creating the test, pause while I review, and run it to confirm its working.

This implementation should make use of a transaction to read all of the resource names of a given resource type, and then create a new resource with a unique name. It should use the naming convention of `{original name} ({index})`, where `index` starts at 1 and is incremented for each new duplicated resource.

### Create API Endpoint

Create a new api endpoint in the `packages/api/src/controllers/resourcesController.ts` using our new methdo. It should be a post endpoint which takes `name`, `workspaceId`, and `resourceType` as parameters.

### Create a new Mutation

Create a new client side mutation to access this endpoint in the style of `packages/dashboard/src/lib/useDeleteUserMutation.ts` or `packages/dashboard/src/lib/useUpdateSegmentsMutation.ts`.

### Consume new Mutation

Allow this mutation to be accessed in the UI. First, from the respective resource index pages e.g. `packages/dashboard/src/pages/segments/index.page.tsx`, and then the individual resource pages e.g. `packages/dashboard/src/pages/segments/v1.page.tsx`. Make sure to update these pages for *all* relevant resources. The index pages should include this action from the actions menu, displayed in the tables' rows. The individual resource pages should include this action in settings menu, displayed on the top right side of the page.