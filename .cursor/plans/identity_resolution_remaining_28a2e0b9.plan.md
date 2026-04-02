---
name: Identity resolution remaining
overview: "Close the gaps left after the first identity-resolution pass: finish resolution primitives (expand-ID SQL, deliveries/analysis parity), optional Kafka path, deeper segment/assignment consistency, segment-entry journey behavior, and API/docs polish—without editing the original plan file."
todos:
  - id: r1-kafka-audit
    content: "[R1] Document current write paths (ch-sync/ch-async/kafka) and where alias rows miss identity tables"
    status: completed
  - id: r1-kafka-mv-design
    content: "[R1] Choose MV vs chained MV vs app consumer; define column mapping from user_events_v2 alias rows to identity_links_v1 + latest"
    status: completed
  - id: r1-kafka-mv-ddl
    content: "[R1] Add DDL in clickhouse.ts (createUserEventsTables / mvQueries) + idempotent exec order with existing tables"
    status: completed
  - id: r1-kafka-mv-test
    content: "[R1] Integration or CH test—ingest alias via Kafka path and assert rows in identity_links_latest_v1 FINAL"
    status: completed
  - id: r1-submit-alias-decision
    content: "[R1] Product decision—standalone alias endpoint vs batch-only; record in docs if deferred"
    status: completed
  - id: r1-submit-alias-backend
    content: "[R1] If approved—add submitAlias in apps.ts reusing insertUserEvents + insertIdentityLinksFromBatch (single message)"
    status: completed
  - id: r1-submit-alias-route
    content: "[R1] If approved—wire Fastify/admin route + schema validation (TypeBox) + auth like batch"
    status: completed
  - id: r2-expand-spec
    content: "[R2] Document expand semantics (known userId + linked anonymous_ids, workspace scope, empty link = singleton IN)"
    status: completed
  - id: r2-expand-impl
    content: "[R2] Implement expandKnownUserIdsPredicateSql(workspaceClause, userIdParam) in identityLinks.ts using identity_links_latest_v1 FINAL"
    status: completed
  - id: r2-expand-tests
    content: "[R2] Unit tests for expand SQL fragment + qb param binding; edge case no links / multiple anon / child workspaces"
    status: completed
  - id: r2-deliveries-inventory
    content: "[R2] List all deliveries.ts branches filtering user_or_anonymous_id or userId (message sends, joins, subscriptions)"
    status: completed
  - id: r2-deliveries-user-filter
    content: "[R2] Replace scalar/array userId filters (~186–195) with expand predicate where filter means logical user"
    status: completed
  - id: r2-deliveries-joins
    content: "[R2] Audit remaining user_or_anonymous_id equality joins (~435–459, ~764)—apply expand or document exception"
    status: completed
  - id: r2-deliveries-tests
    content: "[R2] Add/adjust deliveries tests for user with alias—expect rows under both ids merged in results"
    status: completed
  - id: r2-analysis-site-a
    content: "[R2] Apply expand to first filters.userIds site in analysis.ts (~168–170)"
    status: completed
  - id: r2-analysis-site-b
    content: "[R2] Apply expand to second filters.userIds site in analysis.ts (~442–444)"
    status: completed
  - id: r2-analysis-tests
    content: "[R2] Regression tests for analysis queries with linked anonymous + known id"
    status: completed
  - id: r2-dictionary-baseline
    content: "[R2] Optional—capture query latency baseline for getUsers / deliveries / compute before dictionary"
    status: completed
  - id: r2-dictionary-ddl
    content: "[R2] Optional—add CH dictionary DDL + reload schedule; replace correlated subquery in hottest path only if baseline warrants"
    status: completed
  - id: r3-reconcile-design
    content: "[R3] Choose strategy—merge assignments, delete anonymous rows, or enqueue per-user recompute on alias"
    status: completed
  - id: r3-reconcile-assignments
    content: "[R3] Implement chosen approach for computed_property_assignments_v2 (and related indexes if any)"
    status: completed
  - id: r3-reconcile-processed
    content: "[R3] Align processed_computed_properties_v2 / journey side effects if duplicate keys cause double processing"
    status: completed
  - id: r3-reconcile-job-hook
    content: "[R3] Hook from alias ingest (or MV) to enqueue reconcile for (workspace_id, user_id, anonymous_ids) with debounce"
    status: completed
  - id: r3-reconcile-tests
    content: "[R3] Tests—after alias, single canonical row in assignments; no duplicate segment triggers from stale anon row"
    status: completed
  - id: r4-grep-inventory
    content: "[R4] Inventory computePropertiesIncremental.ts—all user_events_v2 FROM + user_or_anonymous_id in SELECT/GROUP BY/WHERE"
    status: completed
  - id: r4-assign-performed-many
    content: "[R4] Fix assignPerformedManyUserPropertiesQuery / similar (~2739+)—GROUP BY user key vs canonical or expand message_id fan-in"
    status: completed
  - id: r4-assign-standard
    content: "[R4] Audit assignStandardUserPropertiesQuery and other INSERT INTO computed_property_assignments_v2 builders"
    status: completed
  - id: r4-probe-query
    content: "[R4] Review ~4827 user_events_v2 probe—ensure presence checks not skewed by split identity"
    status: completed
  - id: r4-argmax-subqueries
    content: "[R4] Evaluate argMaxValue user_or_anonymous_id (~2531)—swap to canonical expression if state key must match insert"
    status: completed
  - id: r4-joined-prior-design
    content: "[R4] Design joinedPrior fix—same-user equivalence (linked ids) vs one-time state migration"
    status: completed
  - id: r4-joined-prior-implement
    content: "[R4] Implement chosen joinedPrior / anti-join change + document recompute need for existing workspaces"
    status: completed
  - id: r4-incremental-tests
    content: "[R4] Segment/user-property integration tests—alias then compute—expect single canonical state path"
    status: completed
  - id: r5-product-doc
    content: "[R5] Document segment-entry journey behavior when user has linked anonymous RUNNING workflow (skip vs signal vs allow)"
    status: completed
  - id: r5-segment-entry-implement
    content: "[R5] Implement minimal code in triggerSegmentEntryJourney—reuse getLinkedAnonymousIds + Temporal describe pattern"
    status: completed
  - id: r5-segment-entry-tests
    content: "[R5] Tests for segment entry + prior anonymous journey (mock Temporal client)"
    status: completed
  - id: r5-epic-migration
    content: "[R5] Future epic—workflow ID migration / signal handoff for anonymous→known (explicit backlog item only)"
    status: completed
  - id: r6-openapi-locate
    content: "[R6] Locate generated OpenAPI / TypeBox route defs for batch body; confirm BatchItem includes alias"
    status: completed
  - id: r6-openapi-update
    content: "[R6] Regenerate or hand-update schema + examples for type alias + previousId"
    status: completed
  - id: r6-docs-web-sdk
    content: "[R6] Extend web.mdx—Kafka identity gap, batch alias example, link to admin API once OpenAPI updated"
    status: completed
  - id: r6-docs-ops
    content: "[R6] Short ops note—OPTIMIZE/FINAL expectations for identity_links_latest_v1 if needed"
    status: completed
isProject: false
---

# Remaining identity resolution work

## What is already done (baseline)

- Tables `identity_links_v1` / `identity_links_latest_v1` and batch alias ingest via `[packages/backend-lib/src/apps/batch.ts](packages/backend-lib/src/apps/batch.ts)` + `[packages/backend-lib/src/identityLinks.ts](packages/backend-lib/src/identityLinks.ts)`.
- Users list / count anti-join in `[packages/backend-lib/src/users.ts](packages/backend-lib/src/users.ts)`.
- Canonical grouping key on the **main** `computed_property_state_v3` insert in `[packages/backend-lib/src/computedProperties/computePropertiesIncremental.ts](packages/backend-lib/src/computedProperties/computePropertiesIncremental.ts)` (~3171).
- Keyed **event-entry** journey dedupe in `[packages/backend-lib/src/journeys/journeyIdentityDedupe.ts](packages/backend-lib/src/journeys/journeyIdentityDedupe.ts)`.

## Phase R1 — Ingest completeness (optional but plan-aligned)


| Item                     | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kafka / MV path**      | App `submitBatch` writes identity rows; `**user_events_mv_v2`** ingestion does not. Add a ClickHouse **materialized view** from `user_events_v2` where `event_type = 'alias'` into `identity_links_v1` (+ same row shape into `identity_links_latest_v1` or a chained MV), **or** document that self-hosted Kafka mode must run a consumer job. Primary file: `[packages/backend-lib/src/userEvents/clickhouse.ts](packages/backend-lib/src/userEvents/clickhouse.ts)` next to existing MV patterns. |
| **Standalone alias API** | Plan mentioned `AliasData` (not only batch). If the public HTTP API only accepts `BatchAppData`, either add a thin `**submitAlias`** in `[packages/backend-lib/src/apps.ts](packages/backend-lib/src/apps.ts)` + route, or explicitly **defer** and keep batch-only (product decision).                                                                                                                                                                                                              |


```mermaid
flowchart LR
  subgraph appPath [App batch path]
    B[submitBatch] --> UE[user_events_v2]
    B --> IL[identity tables]
  end
  subgraph kafkaGap [Kafka gap today]
    K[user_events_queue_v2] --> UE2[user_events_v2]
    UE2 -.->|no link write| IL
  end
```



## Phase R2 — Resolution primitives (finish Phase 2)


| Item                                                               | Why                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `**expandKnownUserIdsSql**`                                        | Plan: given canonical `user_id`, produce `user_or_anonymous_id IN (userId, anon1, anon2, …)` via `identity_links_latest_v1 FINAL` scoped by `workspace_id`. Add next to existing helpers in `[identityLinks.ts](packages/backend-lib/src/identityLinks.ts)`. |
| **Wire `[deliveries.ts](packages/backend-lib/src/deliveries.ts)`** | Today `userId` filters use `user_or_anonymous_id =` / `IN` only (e.g. ~186–195). For **known** users, expand to include linked anonymous ids so message history and joins match merged identity.                                                             |
| **Wire `[analysis.ts](packages/backend-lib/src/analysis.ts)`**     | Same pattern for `filters.userIds` (~168–170, ~442–444).                                                                                                                                                                                                     |
| **Optional dictionary**                                            | Spike only: CH **dictionary** over `identity_links_latest_v1` + reload interval; use if profiling shows correlated subqueries dominate.                                                                                                                      |


## Phase R3 — Assignments / “Option B” (plan Phase 3 follow-up)


| Item                                    | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reconcile duplicate assignment keys** | Canonical state may grow on `user_id` while **old rows** still exist under `anonymous_id` in `computed_property_assignments_v2` / `processed_computed_properties_v2`. Options: (a) **one-off + periodic** job merging rows for linked pairs, (b) **backfill** recomputing affected users after alias, (c) document “until recompute, counts may differ.” Ties to workspace delete paths in `[users.ts](packages/backend-lib/src/users.ts)` if you add targeted DELETE by `anonymous_id` after link. |


## Phase R4 — Segment / user-property compute depth (plan Phase 4)


| Item                                                               | Why                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Audit all `user_events_v2` reads**                               | Only the bulk state insert uses `[canonicalUserKeyFromUserEventsSql](packages/backend-lib/src/identityLinks.ts)`. Grep for `from user_events_v2` and `user_or_anonymous_id` in `[computePropertiesIncremental.ts](packages/backend-lib/src/computedProperties/computePropertiesIncremental.ts)` (e.g. assignment builders ~2615+, ~2739+, probe query ~4827) and align **GROUP BY / user key** with canonical semantics where state is per-user. |
| `**joinedPrior` / state dedup**                                    | The `NOT IN (SELECT user_id … FROM computed_property_state_v3)` block (~3153–3167) still compares **legacy anonymous** `user_id` in state vs **canonical** keys on insert—risk of duplicate or skipped updates. Define policy: migrate keys, or widen the anti-join to treat linked ids as same user.                                                                                                                                            |
| **Subqueries using `argMaxValue: "user_or_anonymous_id"`** (~2531) | Confirm whether emitted SQL should use canonical expression instead of raw column for segment nodes that aggregate identity.                                                                                                                                                                                                                                                                                                                     |


## Phase R5 — Journeys (plan Phase 5)


| Item                       | Why                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Segment-entry journeys** | `[triggerSegmentEntryJourney](packages/backend-lib/src/journeys.ts)` uses `getUserJourneyWorkflowId({ userId: segmentAssignment.user_id })` (~862–886). No linked-anonymous dedupe. Decide product rule: skip duplicate if anonymous journey still **RUNNING**, **signal** anonymous workflow, or **allow duplicate** (document). |
| **Workflow ID migration**  | Full “continue anonymous journey as known user” likely needs **Temporal** workflow id change or **signal**-based handoff—large; keep as explicit future epic if not in scope.                                                                                                                                                     |


## Phase R6 — API contract and docs


| Item                       | Why                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAPI / admin schema** | Regenerate or extend wherever `BatchItem` / batch body is exported so `alias` appears in public docs.                                                     |
| **Developer docs**         | Extend `[packages/docs/integrations/sdks/web.mdx](packages/docs/integrations/sdks/web.mdx)` with Kafka caveat and batch-only vs dedicated alias endpoint. |


---

## Expanded todo breakdown by phase

The actionable checklist is in the plan **frontmatter** (`todos`, 40 items). Each `content` line starts with `**[R1]`–`[R6]`** for the phase. Summary:


| Phase  | Count | Focus                                                                                                             |
| ------ | ----- | ----------------------------------------------------------------------------------------------------------------- |
| **R1** | 7     | Kafka/MV for alias → identity tables; optional `submitAlias` + route                                              |
| **R2** | 12    | `expandKnownUserIds` SQL + tests; `deliveries` + `analysis` wiring + tests; optional dictionary baseline/DDL      |
| **R3** | 5     | Assignment / processed-property reconciliation design, implementation, hook, tests                                |
| **R4** | 8     | Full `computePropertiesIncremental` audit; assignment queries; probe; argMax; joinedPrior design/implement; tests |
| **R5** | 4     | Segment-entry journey product doc + implement + tests; future epic note for workflow migration                    |
| **R6** | 4     | OpenAPI locate/update; web SDK docs; ops note for FINAL/OPTIMIZE                                                  |


---

## Suggested order

1. **R2** (expand SQL + deliveries + analysis) — highest user-visible consistency, localized changes.
2. **R4** (incremental compute audit) — correctness for segments/user properties.
3. **R3** (assignment reconciliation) — aligns counts with “logical users.”
4. **R5** (segment-entry journey policy + minimal code).
5. **R1** (Kafka MV) and **R6** (OpenAPI/docs) in parallel with QA.
6. **Dictionary** only after metrics justify it.

