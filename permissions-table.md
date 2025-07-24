We're creating a table to Create, Read, and Delete roles for workspace members.

- Currently the only role we're going to support is the admin role.
- It should be created in a new component called `PermissionsTable` in `packages/dashboard/src/components/`
- You can run type checking with `yarn workspace dashboard check`
- The component should be integrated into `packages/dashboard/src/pages/settings.page.tsx` with a new menu section.
- You should create new queries and mutations in the style of `packages/dashboard/src/lib/useDeleteSegmentMutation.ts` and `packages/dashboard/src/lib/useUpdateSegmentsMutation.ts`.
- You should create new api routes and a new controller.
    - See `packages/api/src/controllers/segmentsController.ts` as a reference.
    - It should be integrated into `packages/api/src/buildApp/router.ts`
    - Its schemas should be in `packages/isomorphic-lib/src/types.ts`
    - Create a new file in `packages/backend-lib/src/rbac.ts` file in which to put new methods which will be used by the controller.

