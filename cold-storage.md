# Cold Storage

The goal of this task is to introduce cold storage for user events. We'll be introducing cold storage table.

When a workspace is tombstoned, or paused, we'll be copying all user events to the cold storage table, and then deleting the user events from the `user_events_v2` table. The operation should be reversible, so that we can restore the user events back to the `user_events_v2` table if needed if the workspace is un-tombstoned or un-paused.

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
- Add two new functions to send the user events to the cold strage table and restore the user events from the cold storage table respectively.
- Enable minio, or s3 store for local development, in CI to enable running the tests.

Notes:
- Tests are run with e.g. `yarn jest "packages/backend-lib/src/workspaces.test.ts"`
- You can run typescript checks with: `yarn workspace backend-lib check`
- When copying data from user_events_v2, it should be sufficient to copy the `message_id`, `workspace_id`, `server_time`, `message_raw`, and `processing_time` columns.
- We should delete the workspaces's `internal_events` rows when copying data to the cold storage table.
- When deleting data, we should use async deletes in the style of the `deleteUsers` function in `packages/backend-lib/src/users.ts`.
- When writing data back into user_events_v2, we should make sure if at all possible not to read the data back into application memory, and instead to do a insert .. select query.
- We may want to paginate the data when writing it back into user_events_v2, in order to avoid memory issues.

## Implementation

We'll use a `MergeTree` table with a new storage policy which is backed by s3.

```sql
CREATE TABLE IF NOT EXISTS user_events_cold_storage (
    message_raw String,
    processing_time DateTime64(3),
    workspace_id String,
    message_id String,
    server_time DateTime64(3)
)
ENGINE = MergeTree()
PARTITION BY (workspace_id, toYYYYMM(processing_time))
ORDER BY (workspace_id, processing_time, message_id)
SETTINGS storage_policy = 'cold_storage';
```

```yaml
<clickhouse>
    <storage_configuration>
        <disks>
            <s3_disk>
                <type>s3</type>
                <endpoint>https://s3.amazonaws.com/your-bucket/cold-storage/</endpoint>
                <access_key_id>${accessKey}</access_key_id>
                <secret_access_key>${secretKey}</secret_access_key>
                <metadata_path>/var/lib/clickhouse/disks/s3_metadata/</metadata_path>
                <cache_enabled>false</cache_enabled>  <!-- This handles cache disabling -->
            </s3_disk>
        </disks>
        <policies>
            <cold_storage>
                <volumes>
                    <main>
                        <disk>s3_disk</disk>
                    </main>
                </volumes>
            </cold_storage>
        </policies>
    </storage_configuration>
</clickhouse>

```