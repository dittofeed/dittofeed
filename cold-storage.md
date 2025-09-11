# Cold Storage

The goal of this task is to introduce cold storage for user events. We'll be introducing a new s3 table engine to store user events. see [s3](https://clickhouse.com/docs/engines/table-engines/integrations/s3) for more details.

When a workspace is tombstoned, or paused, we'll be copying all user events to the s3 table engine, and then deleting the user events from the `user_events_v2` table. The operation should be reversible, so that we can restore the user events back to the `user_events_v2` table if needed if the workspace is un-tombstoned or un-paused.

Relevant files:
- Where our clickhouse tables are defined: packages/backend-lib/src/userEvents/clickhouse.ts
- Where our postgres tables are defined: packages/backend-lib/src/db/schema.ts
- Location of our docker compose for local development: docker-compose.yaml
    - This includes our minio instance.
- .github/workflows/shared-workflow.yaml
    - This is where we'll need to enable minio to support our new test.
- Location of our existing tombstone / pause workspace code: packages/backend-lib/src/workspaces.ts

Concepts:
- Workspace: A workspace is what we call a tenant in our multi-tenant system.

Goals:
- Add a new column to the `Workspace` to indicate that a workspace's events are cold stored.
- Write a test to verify that the cold storage operation is reversible.
- Add two new functions to send the user events to the s3 table engine and restore the user events from the s3 table engine respectively.
- Enable minio, or s3 store for local development, in CI to enable running the tests.

Notes:
- Tests are run with e.g. `yarn jest "packages/backend-lib/src/workspaces.test.ts"`
- You can run typescript checks with: `yarn workspace backend-lib check`
- When copying data from user_events_v2, it should be sufficient to copy the `message_raw`, and `processing_time` columns.
- We should delete the `internal_events` table when copying data to the s3 table engine.
- When deleting data, we should use async deletes in the style of the `deleteUsers` function in `packages/backend-lib/src/users.ts`.
