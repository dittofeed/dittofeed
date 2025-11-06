# Computed Property Status

We're making changes to allow computed properties (user properties and segments) to be paused and resumed from our API and dashboard.

For general coding guidance, see `./AGENTS.md`, which includes commands on running type checking, linting, and tests.

## User Property Status

- Create a new method `updateUserPropertyStatus` in `packages/backend-lib/src/userProperties.ts`.
- Create a new endpoint `packages/api/src/controllers/userPropertiesController.ts`.
- Create new hook in the style of `packages/dashboard/src/lib/useJourneyMutation.ts` called `useUserPropertyStatusMutation`.
- Add a Status column to the `packages/dashboard/src/components/userPropertiesTable.tsx` component.
- Add a new action in the Actions column to pause and resume the user property.
  - This action should alternatively be called "Pause" and "Resume" depending on the current status.
  - It should use the mutation we just created.

## Segment Status

Take the equivalent of the steps take for the user property status and apply them to the segment status.