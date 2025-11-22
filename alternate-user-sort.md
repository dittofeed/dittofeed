# Feature Specification: Alternate User Sort

## Preamble

### High-Level Goal

Implement "Alternate User Sort" to allow Dittofeed users to sort the "Users" table by arbitrary User Properties (e.g., `email`, `createdAt`, `age`). Currently, the system only supports sorting by `user_id`.

### Current Status

  * **Database**: User properties are stored as JSON strings in ClickHouse (`computed_property_assignments_v2`). Sorting directly on these JSON strings is performant-prohibitive for large datasets.
  * **Frontend**: The Users table only allows pagination based on `user_id`.

### Proposed Architecture: Selective Indexing

To balance flexibility and performance, we will not index every property. Instead, we will implement a **Selective Indexing** strategy:

1.  **Configuration**: Users explicitly choose which properties to "Index" via the UI.
2.  **Storage**: We create typed index tables in ClickHouse (String, Number, Date) populated only for configured properties.
3.  **Pagination**: We use a "Two-Step" cursor strategy. We first fetch sorted IDs from the index, and if that page is exhausted, we fall back to the main table (the "remainder") to ensure all users are listed.

-----

## Phase 1: Backend Implementation

### Step 1: Postgres Schema Changes

**File:** `packages/backend-lib/src/db/schema.ts`

Add a new table to track which properties are indexed and their data types.

```typescript
import { pgEnum, pgTable, uuid, text, timestamp, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";

// Add Enum
export const dbUserPropertyIndexType = pgEnum("DBUserPropertyIndexType", [
  "String",
  "Number",
  "Date",
]);

// Add Table
export const userPropertyIndex = pgTable(
  "UserPropertyIndex",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    userPropertyId: uuid().notNull(),
    type: dbUserPropertyIndexType().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("UserPropertyIndex_userPropertyId_key").using(
      "btree",
      table.userPropertyId
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "UserPropertyIndex_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.userPropertyId],
      foreignColumns: [userProperty.id],
      name: "UserPropertyIndex_userPropertyId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ]
);
```

### Step 2: ClickHouse Schema & Materialized Views

**File:** `packages/backend-lib/src/userEvents/clickhouse.ts`

Add queries to create index tables and Materialized Views that populate them. The tables are partitioned by workspace and year.

```typescript
// 1. Config Table (Allow List)
export const CREATE_USER_PROPERTY_INDEX_CONFIG_QUERY = `
  CREATE TABLE IF NOT EXISTS user_property_index_config (
    workspace_id String,
    user_property_id String,
    type Enum('String' = 1, 'Number' = 2, 'Date' = 3)
  )
  ENGINE = ReplacingMergeTree()
  ORDER BY (workspace_id, user_property_id);
`;

// 2. Index Tables 
// Partitioned by workspace_id and year for efficient data management

// Number Index
export const CREATE_USER_PROPERTY_IDX_NUM_QUERY = `
  CREATE TABLE IF NOT EXISTS user_property_idx_num (
    workspace_id LowCardinality(String),
    computed_property_id LowCardinality(String),
    user_id String,
    value_num Float64,
    assigned_at DateTime64(3)
  )
  ENGINE = ReplacingMergeTree(assigned_at)
  PARTITION BY (workspace_id, toYear(assigned_at))
  ORDER BY (workspace_id, computed_property_id, value_num, user_id);
`;

// String Index
export const CREATE_USER_PROPERTY_IDX_STR_QUERY = `
  CREATE TABLE IF NOT EXISTS user_property_idx_str (
    workspace_id LowCardinality(String),
    computed_property_id LowCardinality(String),
    user_id String,
    value_str String,
    assigned_at DateTime64(3)
  )
  ENGINE = ReplacingMergeTree(assigned_at)
  PARTITION BY (workspace_id, toYear(assigned_at))
  ORDER BY (workspace_id, computed_property_id, value_str, user_id);
`;

// Date Index
export const CREATE_USER_PROPERTY_IDX_DATE_QUERY = `
  CREATE TABLE IF NOT EXISTS user_property_idx_date (
    workspace_id LowCardinality(String),
    computed_property_id LowCardinality(String),
    user_id String,
    value_date DateTime64(3),
    assigned_at DateTime64(3)
  )
  ENGINE = ReplacingMergeTree(assigned_at)
  PARTITION BY (workspace_id, toYear(assigned_at))
  ORDER BY (workspace_id, computed_property_id, value_date, user_id);
`;

// 3. Materialized Views (Filtered by Config)

export const CREATE_USER_PROPERTY_IDX_NUM_MV_QUERY = `
  CREATE MATERIALIZED VIEW IF NOT EXISTS user_property_idx_num_mv
  TO user_property_idx_num
  AS SELECT
    ue.workspace_id,
    ue.computed_property_id,
    ue.user_id,
    JSONExtractFloat(ue.user_property_value) as value_num,
    ue.assigned_at
  FROM computed_property_assignments_v2 as ue
  WHERE computed_property_id IN (
    SELECT user_property_id FROM user_property_index_config WHERE type = 'Number'
  )
  AND isNotNull(value_num);
`;

export const CREATE_USER_PROPERTY_IDX_STR_MV_QUERY = `
  CREATE MATERIALIZED VIEW IF NOT EXISTS user_property_idx_str_mv
  TO user_property_idx_str
  AS SELECT
    ue.workspace_id,
    ue.computed_property_id,
    ue.user_id,
    trim(BOTH '"' FROM ue.user_property_value) as value_str,
    ue.assigned_at
  FROM computed_property_assignments_v2 as ue
  WHERE computed_property_id IN (
    SELECT user_property_id FROM user_property_index_config WHERE type = 'String'
  )
  AND length(value_str) > 0;
`;

export const CREATE_USER_PROPERTY_IDX_DATE_MV_QUERY = `
  CREATE MATERIALIZED VIEW IF NOT EXISTS user_property_idx_date_mv
  TO user_property_idx_date
  AS SELECT
    ue.workspace_id,
    ue.computed_property_id,
    ue.user_id,
    parseDateTime64BestEffortOrNull(trim(BOTH '"' FROM ue.user_property_value), 3) as value_date,
    ue.assigned_at
  FROM computed_property_assignments_v2 as ue
  WHERE computed_property_id IN (
    SELECT user_property_id FROM user_property_index_config WHERE type = 'Date'
  )
  AND isNotNull(value_date);
`;
```

### Step 3: Index Management Logic (Service Layer & Testing)

#### A. Service Implementation

**File:** `packages/backend-lib/src/userPropertyIndices.ts` (New File)

Implement `upsert` and `delete` logic.
**Important:** Do NOT run ClickHouse queries inside the Postgres transaction. If the ClickHouse operation fails, we accept the drift (or handle it via retry logic), but we must not block the primary DB.

```typescript
import { db } from "./db";
import { userPropertyIndex } from "./db/schema";
import { clickhouseClient } from "./clickhouse";
import { eq, and } from "drizzle-orm";

async function pruneIndex({ workspaceId, userPropertyId, type }: { workspaceId: string, userPropertyId: string, type: string }) {
  let table = '';
  if (type === 'Number') table = 'user_property_idx_num';
  else if (type === 'String') table = 'user_property_idx_str';
  else if (type === 'Date')   table = 'user_property_idx_date';

  // Lightweight Delete
  await clickhouseClient().query({
    query: `DELETE FROM ${table} WHERE workspace_id = {workspaceId:String} AND computed_property_id = {userPropertyId:String} SETTINGS mutations_sync = 0, lightweight_deletes_sync = 0`,
    params: { workspaceId, userPropertyId }
  });
}

async function backfillIndex({ workspaceId, userPropertyId, type }: { workspaceId: string, userPropertyId: string, type: string }) {
  // Logic to INSERT INTO index_table SELECT ... FROM assignments ...
  // (See previous conversation for full query details)
}

export async function upsertUserPropertyIndex({
  workspaceId,
  userPropertyId,
  type
}: {
  workspaceId: string;
  userPropertyId: string;
  type: 'String' | 'Number' | 'Date';
}) {
  // 1. Fetch existing state (No transaction needed for read)
  const existing = await db().query.userPropertyIndex.findFirst({
    where: and(eq(userPropertyIndex.workspaceId, workspaceId), eq(userPropertyIndex.userPropertyId, userPropertyId))
  });

  // 2. Update Postgres Source of Truth
  await db().insert(userPropertyIndex)
    .values({ workspaceId, userPropertyId, type })
    .onConflictDoUpdate({
      target: userPropertyIndex.userPropertyId,
      set: { type, updatedAt: new Date() }
    });

  // 3. Perform ClickHouse Operations (Sequentially, outside PG transaction)
  
  // A. Update Config (Allow MV to process new events)
  await clickhouseClient().query({
    query: `INSERT INTO user_property_index_config (workspace_id, user_property_id, type) VALUES ({workspaceId:String}, {userPropertyId:String}, {type:String})`,
    params: { workspaceId, userPropertyId, type }
  });

  // B. Handle Type Change (Prune old data if type switched)
  if (existing && existing.type !== type) {
    await pruneIndex({ workspaceId, userPropertyId, type: existing.type });
  }

  // C. Backfill (Populate index with existing data)
  if (!existing || existing.type !== type) {
    await backfillIndex({ workspaceId, userPropertyId, type });
  }
}

export async function deleteUserPropertyIndex({
  workspaceId,
  userPropertyId
}: {
  workspaceId: string;
  userPropertyId: string;
}) {
  const existing = await db().query.userPropertyIndex.findFirst({
    where: and(eq(userPropertyIndex.workspaceId, workspaceId), eq(userPropertyIndex.userPropertyId, userPropertyId))
  });

  if (!existing) return;

  // 1. Delete from Postgres
  await db().delete(userPropertyIndex).where(eq(userPropertyIndex.id, existing.id));

  // 2. Remove from ClickHouse Config
  await clickhouseClient().query({
    query: `DELETE FROM user_property_index_config WHERE workspace_id = {workspaceId:String} AND user_property_id = {userPropertyId:String}`,
    params: { workspaceId, userPropertyId }
  });

  // 3. Prune Data
  await pruneIndex({ workspaceId, userPropertyId, type: existing.type });
}
```

#### B. Testing Scenarios

**File:** `packages/backend-lib/src/userPropertyIndices.test.ts` (New File)

Create a test file similar to `packages/backend-lib/src/users.test.ts`. You should test the following scenarios:

1.  **Upsert (New Index)**: Create a property index and verify:
      * Record exists in Postgres `userPropertyIndex`.
      * Record exists in ClickHouse `user_property_index_config`.
      * Data is backfilled into the correct ClickHouse index table (`user_property_idx_num`, etc.).
2.  **Upsert (Update Type)**: Update an existing index from `String` to `Number` and verify:
      * Data is removed from `user_property_idx_str`.
      * Data is added to `user_property_idx_num`.
      * Postgres record is updated.
3.  **Delete Index**: Delete an index and verify:
      * Records are removed from Postgres and ClickHouse config.
      * Data is pruned from the index table.

### Step 4: API Endpoints & Router

**File:** `packages/api/src/controllers/userPropertyIndexController.ts`

Create a new controller to expose the logic via REST API. Implement the following operations using the service layer created in Step 3.

1.  **List Indexes:** GET endpoint to list all configured indexes for the workspace.
2.  **Upsert Index:** PUT endpoint to call `upsertUserPropertyIndex`.
3.  **Delete Index:** DELETE endpoint to call `deleteUserPropertyIndex`.

**File:** `packages/api/src/buildApp/router.ts`
Register the new controller and endpoints in the API router to ensure they are accessible.

### Step 5: Modify `getUsers`

**File:** `packages/backend-lib/src/users.ts`

Modify the `getUsers` function to implement the Two-Step (Index + Remainder) Query Strategy.

1.  **Update Type Definitions:** Update `GetUsersRequest` (or the internal type used by the function) to accept `sortBy` (string, optional).
2.  **Define Sorting Cursor:**
    ```typescript
    interface UserSortCursor {
      phase: 'indexed' | 'remainder';
      userId: string;
      val?: string | number | null;
    }
    ```
3.  **Implementation Logic:**
      * **Default Behavior:** If `sortBy` is undefined, null, or `'id'`, use the existing logic (query `computed_property_assignments_v2` or `user_events_v2` ordered by `user_id`).
      * **Sorted Behavior:**
          * Look up the index type for the requested `sortBy` property in the Postgres `UserPropertyIndex` table (you likely already have this data cached or can fetch it).
          * **Phase A (Index):** Query the appropriate index table (`user_property_idx_{type}`).
              * Clause: `WHERE workspace_id = ... AND computed_property_id = ...`
              * Cursor Filter: `AND (value, user_id) > (cursor.val, cursor.userId)`
              * Limit: `pageSize`
          * **Phase B (Remainder):** If the results from Phase A are less than `pageSize`:
              * Calculate `remainingLimit = pageSize - resultsA.length`.
              * Query the main table (Assignments or User Events).
              * Clause: `WHERE user_id NOT IN (SELECT user_id FROM index_table ...)`
              * Cursor Filter: If we were *already* in the remainder phase in the previous page, filter by `user_id > cursor.userId`.
              * Limit: `remainingLimit`.
      * **Result Merging:** Combine the results.
      * **Next Cursor:** Construct the cursor for the *last* item in the combined list. If the last item came from the Index, cursor is `{ phase: 'indexed', val: ..., userId: ... }`. If from Remainder, `{ phase: 'remainder', userId: ... }`.

### Step 6: Test `getUsers` Modifications

**File:** `packages/backend-lib/src/users.test.ts`

Add a new `describe` block for "Sorting". You must test:

1.  **Numeric Sort:**
      * Create a numeric User Property "age".
      * Create index for "age" (Type: Number).
      * Create users with various ages (including duplicates).
      * Call `getUsers({ sortBy: 'age' })`.
      * **Assert:** Users are returned in correct numeric order.
2.  **String Sort:**
      * Create string property "name".
      * Create index (Type: String).
      * Call `getUsers({ sortBy: 'name' })`.
      * **Assert:** Users returned in alphabetical order.
3.  **Pagination Transition (The "Seam"):**
      * Create 10 users *with* the property and 10 users *without*.
      * Call `getUsers({ limit: 5 })` (Page 1 - All Indexed).
      * Call `getUsers` with cursor from Page 1.
      * **Assert:** Page 2 contains the remaining 5 indexed users + the first 5 non-indexed users.
      * Call `getUsers` with cursor from Page 2.
      * **Assert:** Page 3 contains the remaining 5 non-indexed users.
4.  **Default Fallback:**
      * Call `getUsers()` without `sortBy`.
      * **Assert:** Results are sorted by `user_id`.

-----

## Phase 2: Frontend Implementation

### Step 1: React Query Hooks

Create three new files matching the patterns in `packages/dashboard/src/lib/useSegmentsQuery.ts` and `packages/dashboard/src/lib/useUpdateSegmentsMutation.ts`.

**File:** `packages/dashboard/src/lib/useUserPropertyIndicesQuery.ts`
This hook lists all indexed properties.

```typescript
import { useQuery, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import axios from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { CompletionStatus } from "isomorphic-lib/src/types"; 
// NOTE: Define GetUserPropertyIndicesResponse in isomorphic-lib types first
import { GetUserPropertyIndicesResponse } from "isomorphic-lib/src/types"; 

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const USER_PROPERTY_INDICES_QUERY_KEY = "userPropertyIndices";

export function useUserPropertyIndicesQuery(
  options?: Omit<
    UseQueryOptions<GetUserPropertyIndicesResponse, Error>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<GetUserPropertyIndicesResponse> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for indices query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [USER_PROPERTY_INDICES_QUERY_KEY, { workspaceId }];

  return useQuery<GetUserPropertyIndicesResponse, Error>({
    queryKey,
    queryFn: async () => {
      const response = await axios.get(`${baseApiUrl}/path/to/indices`, { // Use actual path defined in Phase 1
        params: { workspaceId },
        headers: authHeaders,
      });
      return unwrap(schemaValidateWithErr(response.data, GetUserPropertyIndicesResponse));
    },
    ...options,
  });
}
```

**File:** `packages/dashboard/src/lib/useUpsertUserPropertyIndexMutation.ts`
This hook handles both creating and updating an index (e.g., changing type).

```typescript
import { useMutation, UseMutationOptions, UseMutationResult, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { USER_PROPERTY_INDICES_QUERY_KEY } from "./useUserPropertyIndicesQuery";

export interface UpsertUserPropertyIndexParams {
  userPropertyId: string;
  type: 'String' | 'Number' | 'Date';
}

export function useUpsertUserPropertyIndexMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, UpsertUserPropertyIndexParams>,
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, UpsertUserPropertyIndexParams> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (data: UpsertUserPropertyIndexParams) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;

    await axios.put(
      `${baseApiUrl}/path/to/index/${data.userPropertyId}`, // Use actual path defined in Phase 1
      { ...data, workspaceId },
      { headers: { "Content-Type": "application/json", ...authHeaders } },
    );
  };

  return useMutation({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);
      if (workspace.type === CompletionStatus.Successful) {
        queryClient.invalidateQueries({
          queryKey: [USER_PROPERTY_INDICES_QUERY_KEY, { workspaceId: workspace.value.id }],
        });
      }
    },
  });
}
```

**File:** `packages/dashboard/src/lib/useDeleteUserPropertyIndexMutation.ts`
This hook handles removing an index.

```typescript
import { useMutation, UseMutationOptions, UseMutationResult, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { USER_PROPERTY_INDICES_QUERY_KEY } from "./useUserPropertyIndicesQuery";

export interface DeleteUserPropertyIndexParams {
  userPropertyId: string;
}

export function useDeleteUserPropertyIndexMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, DeleteUserPropertyIndexParams>,
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, DeleteUserPropertyIndexParams> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async ({ userPropertyId }: DeleteUserPropertyIndexParams) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;

    await axios.delete(
      `${baseApiUrl}/path/to/index/${userPropertyId}`, // Use actual path defined in Phase 1
      { 
        data: { workspaceId },
        headers: { "Content-Type": "application/json", ...authHeaders } 
      },
    );
  };

  return useMutation({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);
      if (workspace.type === CompletionStatus.Successful) {
        queryClient.invalidateQueries({
          queryKey: [USER_PROPERTY_INDICES_QUERY_KEY, { workspaceId: workspace.value.id }],
        });
      }
    },
  });
}
```

### Step 2: Configure Dialog Component (Creation UX)

**File:** `packages/dashboard/src/components/usersTable/configureSortIndicesDialog.tsx`

Create a modal that lists all User Properties. This acts as both the **List View** and **Creation/Deletion Interface**.

  * **Render**: Map over all `UserProperties` (from `useUserPropertiesQuery`).
  * **State**: Join with data from `useUserPropertyIndicesQuery` to determine the current state of each property.
  * **Interaction (The Creation UX)**:
      * Render a `<Select>` for each property with options: `None`, `String`, `Number`, `Date`.
      * **On Change**:
          * If value changes from `None` to `[Type]`: Call `useUpsertUserPropertyIndexMutation` (Creates index).
          * If value changes from `[Type]` to `[NewType]`: Call `useUpsertUserPropertyIndexMutation` (Updates index).
          * If value changes from `[Type]` to `None`: Call `useDeleteUserPropertyIndexMutation` (Deletes index).

### Step 3: Sort Selector Component

**File:** `packages/dashboard/src/components/usersTable/sortBySelector.tsx`

Create a Toolbar button that combines sorting selection with configuration access.

  * **Dropdown Items**:
    1.  "Default (User ID)"
    2.  ...List of currently indexed properties (derived from `useUserPropertyIndicesQuery`)...
    3.  Divider
    4.  "Manage Sort Keys..." (Opens the Dialog from Step 2)

### Step 4: Integration

**File:** `packages/dashboard/src/components/usersTableV2.tsx`

1.  Add `sortBy` state.
2.  Add `SortBySelector` to the controls.
3.  Pass `sortBy` to `useUsersQuery`.
4.  Ensure the `UsersTableV2` component handles the "default" state gracefully (if `sortBy` is undefined, it behaves exactly as it does today, sorting by user ID).