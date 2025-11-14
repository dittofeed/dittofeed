# Not Exists Segment Debug

General guidelines:

- You are are here for debugging, not coding.
- Do not write code unless you receive explicit permission to do so.
- You should communicate frequently and liberally, asking for clarification and feedback as needed.

## Background

Segments are sets of users that match a set of criteria. This criteri is defined with a JSON dsl. This criteria defines a set of traits or behaviors that a user must have or not have to be in the segment.

These segment assignments are calculated and stored in clickhouse, where the relevant file is packages/backend-lib/src/computedProperties/computePropertiesIncremental.ts. For more insight into the behavior of the segments see packages/backend-lib/src/computedProperties/computePropertiesIncremental.test.ts. The relevant tables are defined in packages/backend-lib/src/userEvents/clickhouse.ts.

## Symptoms

There's an issue in the NotEquals segment operator. It appears, in production, to contain users that should not be in the segment. The affected users have received an identify event with a non-empty trait value at the specified path, and so should not be in the segment, but are.

An additional symptom is that the problematic segment node appears to be represented multiple times in our state table, by multiple state ids, suggesting that perhaps this issue arises when the segment definition is updated.

## Proposed Fix / Plan

### Problem in current NotExists semantics

- Today, trait `NotExists` for a path (e.g. `isPremium`, `email`) is computed directly from identify events:
  - In `segmentNodeToStateSubQuery` for `SegmentNodeType.Trait` + `SegmentOperatorType.NotExists`, each identify event contributes a `last_value`:
    - If `JSON_VALUE(properties, path) == ''` → store a sentinel `stateId` string.
    - Otherwise → store the actual value.
  - `segmentToResolvedState` then sets `segment_state_value = (argMaxMerge(last_value) == stateId)`.
- This has an unintended consequence:
  - A user can have a **non-empty** value at the path at one point in time (e.g. `isPremium = true`), and later send an identify that **omits** the trait entirely.
  - The later identify yields `JSON_VALUE(...) == ''`, which overwrites `last_value` with the sentinel.
  - Because the later event has a later `event_time`, `argMaxMerge(last_value)` becomes the sentinel, so `NotExists` becomes `true` again.
  - Result: users who have had a non-empty value in the past can re-enter a `NotExists` segment after a later identify that simply omits the trait.
- This behavior differs from the intuitive semantics:
  - Desired: `NotExists(path)` should mean “this user has **never** had a non-empty value at this path, or it has been explicitly cleared”.
  - Actual: `NotExists(path)` effectively means “the **last** identify we saw has this trait missing/empty”, which is too permissive and causes users to flip back into the `NotExists` segment.

### Real-world manifestation (example)

- Workspace: `"Hebrew Bible"` (`workspace_id = 30b79ff7-e3c9-445c-b3ae-b65a9f371934`).
- Segments:
  - Premium: `isPremium = true` (`segment_id = e3f438c9-c1b1-45fb-b5f8-02608871fd6d`).
  - Non-premium: `isPremium = false OR isPremium NotExists` (`segment_id = 922b7d34-0123-4532-80db-c7a099ea27a4`).
- Observed issue:
  - Some users (e.g. `06MRnVjgiANzUNW7T3hc7Gvla2z1_tanach`) appear in **both** premium and non-premium segments, even though they have `isPremium = true`.
- ClickHouse inspection for that user and non-premium segment shows two relevant state ids:
  - One for `isPremium = false`: `last_value_agg = 'true'`, `segment_state_value = false` (as expected).
  - One for `isPremium NotExists`: `last_value_agg = <stateId_sentinel>`, `segment_state_value = true` (unexpected, since the user has had `isPremium = true`).
- This is consistent with an event timeline:
  1. Identify with `isPremium = true`.
  2. Later identify that omits `isPremium` (or sets it empty).
  3. The `NotExists` node sees step 2, overwrites its state with the sentinel, and re-adds the user to the non-premium segment.

### Principle of the fix

- Instead of deriving `NotExists` directly from raw identify events, derive it from the **current user property value** for that path.
- The user property pipeline already implements the intended “upsert” semantics:
  - Later identifies that omit a trait do **not** clear it.
  - Only identifies that explicitly include the trait change its stored value.
- Therefore:
  - For a trait segment `Trait(path, NotExists)`, membership should be computed based on the corresponding user property (e.g. `UP_isPremium`, `UP_email`), not directly from raw events.

### Concrete plan (reusing existing tables/conventions)

1. **Keep state computation for NotExists simple or unused**
   - The existing `segmentNodeToStateSubQuery` for `Trait + NotExists` writes a sentinel into `computed_property_state_v3`.
   - For the fixed implementation we **no longer rely on this sentinel/last_value** to decide NotExists membership.
   - We can:
     - Either leave this subquery as-is but treat it as unused for membership decisions.
     - Or simplify/disable the NotExists branch in `segmentNodeToStateSubQuery` once the new path is trusted.

2. **Change `segmentToResolvedState` for `Trait + NotExists`**
   - Today, `segmentToResolvedState` for trait nodes uses `buildRecentUpdateSegmentQuery` over `computed_property_state_v3` and `argMaxMerge(last_value)`.
   - For `SegmentNodeType.Trait` + `SegmentOperatorType.NotExists`, instead:
     - Look up the user property that corresponds to the trait path (e.g. a `UserPropertyDefinitionType.Trait` on `"isPremium"` or `"email"`), using the `userProperties` passed into `computeAssignments` (similar to how the `Id` property is found).
     - Let `upId` be that user property’s id.
     - Build a query over `computed_property_assignments_v2` that determines, per user, the latest user property value and sets the segment state accordingly.

   - Sketch of the new NotExists segment state query:

     - Compute a per-user “latest value” for the trait user property:
       - From `computed_property_assignments_v2`:
         - `type = 'user_property'`
         - `computed_property_id = upId`
       - Grouped by `(workspace_id, user_id)`:
         - `max(assigned_at) AS max_assigned_at`
         - `argMax(user_property_value, assigned_at) AS latest_user_property_value`
         - (respect the same `assigned_at` bounds you use for periods elsewhere: `assigned_at <= now`, plus a lower bound based on periods if present).

     - Insert into `resolved_segment_state` for the NotExists trait node’s `state_id`:
       - `segment_state_value` is `True` when:
         - There is **no** user property assignment for that user (user has never had the trait), or
         - `latest_user_property_value` encodes an empty value (e.g. empty string / JSON-encoded empty) meaning “cleared”.
       - Otherwise `segment_state_value = False`.

     - This leverages the existing `computed_property_assignments_v2` table and “latest assignment” pattern you already use (e.g. in `buildProcessAssignmentsQuery` and other places).

3. **Leave `resolvedSegmentToAssignment` as-is**
   - `resolvedSegmentToAssignment` already:
     - Computes a `stateId` per node with `segmentNodeStateId`.
     - Builds a boolean expression like `state_values[stateId]` for trait nodes.
   - With the new NotExists handling:
     - `state_values[stateId]` is now the boolean computed from user property assignments (true when the trait is missing/empty per current user property).
     - This plugs cleanly into existing AND/OR logic and segment expressions (e.g. `isPremium = false OR isPremium NotExists` for non-premium).

4. **Semantics after the fix**

- For `Trait(path, NotExists)`:
  - If a user has **never** had a non-empty value for that path (no user property assignment) → `NotExists = true`.
  - If a user’s trait is explicitly cleared (e.g. you define that as sending an empty value and the user property pipeline stores `""`) → `NotExists = true`.
  - If a user has had a non-empty value at any point and it has not been explicitly cleared → `NotExists = false`, regardless of later identifies that omit the trait.

- This:
  - Fixes the “user in both premium and non-premium” issue in production.
  - Fixes the `only: true` test case in `computePropertiesIncremental.test.ts` for user-4 (user should not re-enter a NotExists segment after gaining a non-empty email and later sending an unrelated identify).

5. **Testing strategy**

- Extend `computePropertiesIncremental.test.ts` to include:
  - The existing “trait segment with not exists operator” test (user-4 path), updated to expect no re-entry after a later unrelated identify.
  - A minimal repro with:
    - Start: no trait → in NotExists.
    - Then: trait present (e.g. `isPremium = true`) → out of NotExists.
    - Then: identify with the trait omitted → still out of NotExists.
- Also test a case where the trait is explicitly cleared (if/when you define that behavior), to ensure users can intentionally re-enter a NotExists segment.

### Upgrade strategy (recomputing affected segments)

To roll out the NotExists semantic fix safely without introducing complex in-engine versioning, we can trigger recomputation of affected segments via the admin CLI upgrade scripts:

- In `packages/admin-cli/src/upgrades.ts` for the `v0.22.0 → v0.23.0` step:
  - During the **post-upgrade** phase:
    - Query the `segment` table for segments whose definitions contain at least one node with:
      - `type = SegmentNodeType.Trait` and
      - `operator.type = SegmentOperatorType.NotExists`.
    - For each such segment, update its `definitionUpdatedAt` timestamp to the current time (or a deterministic fixed upgrade timestamp).
- Effects on the compute pipeline:
  - `segmentNodeStateId` already includes `segment.definitionUpdatedAt` in the UUIDv5 name:
    - Bumping `definitionUpdatedAt` changes the `state_id` for all nodes in those segments.
  - The computed-property version used in `computed_property_period` is `segment.definitionUpdatedAt.toString()`:
    - After the upgrade, `(computedPropertyId = segment.id, version = newDefinitionUpdatedAtString)` has no existing periods.
    - On the next `computeState`/`computeAssignments` run:
      - `getPeriodsByComputedPropertyId` returns no period for this new version → `periodBound` is undefined → no pruning for that version.
      - The segment is recomputed from scratch using the new NotExists semantics and new `state_id`s.
  - Old state and periods for the previous `definitionUpdatedAt` version remain in ClickHouse/Postgres but are ignored by future runs, which always key off the new version.
- Scope and safety:
  - Only segments that actually use `Trait + NotExists` are touched:
    - Segments without NotExists nodes retain their existing `definitionUpdatedAt`, versions, and incremental behavior.
    - Affected segments recompute all their nodes once, which is acceptable for a one-time semantic fix.
  - For future semantic changes to other node/operator types, we can follow the same pattern:
    - In the relevant version’s upgrade script, find segments using the affected node/operator combination and bump their `definitionUpdatedAt` in a post-upgrade step.
  - For observability, the upgrade can log how many segments it updated (and optionally their ids/names) per workspace, so we can verify the behavior in staging and production.
