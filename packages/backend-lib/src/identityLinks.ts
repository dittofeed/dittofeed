/**
 * Identity resolution: anonymous_id → known user_id via alias and identify-with-merge events.
 *
 * - identity_links_v1: append log (audit).
 * - identity_links_latest_v1: ReplacingMergeTree(linked_at), one row per (workspace_id, anonymous_id).
 *
 * Reads on the latest table use FINAL for correct ReplacingMergeTree semantics until merges run.
 *
 * ## Ingest paths
 *
 * - **ch-sync / ch-async / kafka:** `user_events_v2` rows with `event_type = 'alias'` are copied into
 *   identity tables by materialized views (`identity_links_*_from_alias_mv`). Identify rows with both
 *   `userId` and `anonymousId` (top-level or `traits.anonymousId` / `traits.anonymous_id` after
 *   normalization in `buildBatchUserEvents` / `buildIdentifyMessageRaw`) are copied by
 *   `identity_links_*_from_identify_mv`.
 * - **insertIdentityLinksFromBatch:** optional manual/backfill path; not used on the default batch
 *   ingest path.
 */

import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  command as chCommand,
  query as chQuery,
} from "./clickhouse";
import logger from "./logger";
import { BatchItem, EventType } from "./types";

export const IDENTITY_LINKS_TABLE = "identity_links_v1";
export const IDENTITY_LINKS_LATEST_TABLE = "identity_links_latest_v1";

/**
 * WHERE fragment: treat filter ids as **known** `user_id` values and match `user_or_anonymous_id` when:
 *
 * - it equals one of those ids, **or**
 * - it is an `anonymous_id` that maps to one of those ids in `identity_links_latest_v1 FINAL`
 *   within the same workspace scope as `workspaceIdClause`.
 *
 * If there are no matching links, the `IN (SELECT anonymous_id …)` branch is empty and the
 * predicate reduces to `user_or_anonymous_id IN ids` only.
 *
 * **Child workspaces:** pass a clause that matches how the outer query scopes workspaces, e.g.
 * `workspace_id IN ({parent}, {child1}, …)` so the subquery uses the same hierarchy.
 *
 * @param workspaceIdClause - e.g. `workspace_id = {v0:String}` aligned with the outer query
 * @param userIdsArrayParam - `qb.addQueryValue(ids, "Array(String)")` (non-empty array)
 */
export function expandKnownUserIdsPredicateSql(
  workspaceIdClause: string,
  userIdsArrayParam: string,
): string {
  return `(
    user_or_anonymous_id IN ${userIdsArrayParam}
    OR user_or_anonymous_id IN (
      SELECT anonymous_id
      FROM ${IDENTITY_LINKS_LATEST_TABLE} FINAL
      WHERE ${workspaceIdClause} AND user_id IN ${userIdsArrayParam}
    )
  )`;
}

/** SQL fragment: exclude assignment keys that are anonymous ids already linked to a known user. */
export function excludeLinkedAnonymousUserIdsSql(
  workspaceIdClause: string,
): string {
  return `AND user_id NOT IN (
    SELECT anonymous_id
    FROM ${IDENTITY_LINKS_LATEST_TABLE} FINAL
    WHERE ${workspaceIdClause}
  )`;
}

/**
 * Grouping key for user_events_v2 rows: known user_id when anonymous_id has a link, else user_or_anonymous_id.
 * Parameter `alias` is the table alias for user_events_v2 (default `ue`).
 *
 * Prefer {@link canonicalUserKeyFromJoinedIdentitySql} with `LEFT JOIN identity_links_latest_v1 … FINAL`
 * in `FROM` — correlated scalar subqueries are not allowed inside `GROUP BY` / aggregate args on newer ClickHouse.
 */
export function canonicalUserKeyFromUserEventsSql(alias = "ue"): string {
  return `coalesce(
  (
    SELECT il.user_id
    FROM ${IDENTITY_LINKS_LATEST_TABLE} AS il FINAL
    WHERE il.workspace_id = ${alias}.workspace_id
      AND il.anonymous_id = ${alias}.user_or_anonymous_id
    LIMIT 1
  ),
  ${alias}.user_or_anonymous_id
)`;
}

/** Join `user_events_v2` to latest identity links (use with {@link canonicalUserKeyFromJoinedIdentitySql}). */
export function identityLinksLatestLeftJoinSql(
  ueAlias = "ue",
  ilAlias = "il",
): string {
  return `LEFT JOIN ${IDENTITY_LINKS_LATEST_TABLE} AS ${ilAlias} FINAL
    ON ${ilAlias}.workspace_id = ${ueAlias}.workspace_id
    AND ${ilAlias}.anonymous_id = ${ueAlias}.user_or_anonymous_id`;
}

/** Canonical user key when `ue` is joined to `il` via {@link identityLinksLatestLeftJoinSql}. */
export function canonicalUserKeyFromJoinedIdentitySql(
  ueAlias = "ue",
  ilAlias = "il",
): string {
  return `if(${ilAlias}.user_id != '', ${ilAlias}.user_id, ${ueAlias}.user_or_anonymous_id)`;
}

/** Read Segment-style anonymous id from identify traits without type assertions. */
export function readTraitAnonymousForLink(traits: unknown): string | undefined {
  if (typeof traits !== "object" || traits === null) {
    return undefined;
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Reflect.get is untyped
  const a = Reflect.get(traits, "anonymousId");
  if (typeof a === "string" && a.length > 0) {
    return a;
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Reflect.get is untyped
  const b = Reflect.get(traits, "anonymous_id");
  if (typeof b === "string" && b.length > 0) {
    return b;
  }
  return undefined;
}

/** True if this identify batch item should create an anonymous→known link (same as alias). */
export function identifyMessageCreatesIdentityLink(
  message: BatchItem,
): boolean {
  if (message.type !== EventType.Identify) {
    return false;
  }
  if (!("userId" in message) || !message.userId) {
    return false;
  }
  if (
    typeof message.anonymousId === "string" &&
    message.anonymousId.length > 0
  ) {
    return true;
  }
  return readTraitAnonymousForLink(message.traits) !== undefined;
}

export function extractAliasLinkRows(
  workspaceId: string,
  batch: BatchItem[],
): {
  workspace_id: string;
  anonymous_id: string;
  user_id: string;
  linked_at: string;
  message_id: string;
}[] {
  const rows: {
    workspace_id: string;
    anonymous_id: string;
    user_id: string;
    linked_at: string;
    message_id: string;
  }[] = [];

  for (const message of batch) {
    if (message.type !== EventType.Alias) {
      continue;
    }
    const { userId, previousId, messageId, timestamp } = message;
    if (!userId || !previousId || !messageId) {
      logger().warn(
        { workspaceId, messageId },
        "Skipping alias message missing userId, previousId, or messageId",
      );
      continue;
    }
    const linkedAt = timestamp ?? new Date().toISOString();
    rows.push({
      workspace_id: workspaceId,
      anonymous_id: previousId,
      user_id: userId,
      linked_at: linkedAt,
      message_id: messageId,
    });
  }

  return rows;
}

function toClickhouseDateTime64(linkedAtIso: string): string {
  const d = new Date(linkedAtIso);
  if (Number.isNaN(d.getTime())) {
    return new Date()
      .toISOString()
      .replace("Z", "")
      .replace("T", " ")
      .slice(0, 23);
  }
  return d.toISOString().replace("Z", "").replace("T", " ").slice(0, 23);
}

/** Insert alias link rows into log + latest tables (after user_events_v2 insert). */
export async function insertIdentityLinksFromBatch(
  workspaceId: string,
  batch: BatchItem[],
): Promise<void> {
  const rawRows = extractAliasLinkRows(workspaceId, batch);
  if (rawRows.length === 0) {
    return;
  }

  const values = rawRows.map((r) => ({
    workspace_id: r.workspace_id,
    anonymous_id: r.anonymous_id,
    user_id: r.user_id,
    linked_at: toClickhouseDateTime64(r.linked_at),
    message_id: r.message_id,
  }));

  const ch = clickhouseClient();
  await ch.insert({
    table: `${IDENTITY_LINKS_TABLE} (workspace_id, anonymous_id, user_id, linked_at, message_id)`,
    values,
    format: "JSONEachRow",
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  await ch.insert({
    table: `${IDENTITY_LINKS_LATEST_TABLE} (workspace_id, anonymous_id, user_id, linked_at, message_id)`,
    values,
    format: "JSONEachRow",
    clickhouse_settings: { wait_end_of_query: 1 },
  });
}

/** Reverse lookup: anonymous ids that map to this known user (for journey dedupe). */
export async function getLinkedAnonymousIdsForKnownUser(
  workspaceId: string,
  knownUserId: string,
): Promise<string[]> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceParam = qb.addQueryValue(workspaceId, "String");
  const userParam = qb.addQueryValue(knownUserId, "String");
  const result = await chQuery({
    query: `
      SELECT anonymous_id
      FROM ${IDENTITY_LINKS_LATEST_TABLE} FINAL
      WHERE workspace_id = ${workspaceParam}
        AND user_id = ${userParam}
    `,
    query_params: qb.getQueries(),
  });
  const rows = await result.json<{ anonymous_id: string }>();
  return rows.map((r) => r.anonymous_id);
}

/** Known user_id for this anonymous_id in latest links, if any. */
export async function getKnownUserIdForLinkedAnonymous(
  workspaceId: string,
  anonymousId: string,
): Promise<string | null> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceParam = qb.addQueryValue(workspaceId, "String");
  const anonParam = qb.addQueryValue(anonymousId, "String");
  const result = await chQuery({
    query: `
      SELECT user_id
      FROM ${IDENTITY_LINKS_LATEST_TABLE} FINAL
      WHERE workspace_id = ${workspaceParam}
        AND anonymous_id = ${anonParam}
      LIMIT 1
    `,
    query_params: qb.getQueries(),
  });
  const rows = await result.json<{ user_id: string }>();
  const id = rows[0]?.user_id;
  return id && id.length > 0 ? id : null;
}

export async function getUserIdentityAliasesForProfile(
  workspaceId: string,
  profileUserId: string,
): Promise<{
  linkedAnonymousIds: string[];
  canonicalUserId: string | null;
}> {
  const linkedAnonymousIds = await getLinkedAnonymousIdsForKnownUser(
    workspaceId,
    profileUserId,
  );
  if (linkedAnonymousIds.length > 0) {
    return { linkedAnonymousIds, canonicalUserId: null };
  }
  const canonicalUserId = await getKnownUserIdForLinkedAnonymous(
    workspaceId,
    profileUserId,
  );
  return { linkedAnonymousIds: [], canonicalUserId };
}

const lightweightDeleteSettings =
  "settings mutations_sync = 0, lightweight_deletes_sync = 0";

/**
 * **R3 strategy:** delete (lightweight delete) rows keyed by `anonymous_id` values that appear in
 * `identity_links_latest_v1` for the workspace—so assignments / processed / state no longer keep
 * parallel keys under the old anonymous id after a known-user alias. Canonical rows are rebuilt on
 * the next compute from `user_events_v2` using {@link canonicalUserKeyFromJoinedIdentitySql} (join + `il` alias).
 *
 * Also clears `computed_property_state_index` and `resolved_segment_state` for those keys so
 * segment resolution does not double-count.
 *
 * **Hooks:** `submitBatch` runs this when a chunk contains an alias or identify-with-link;
 * `reconcileLinkedAnonymousUserTablesThrottled` runs at most once per workspace per minute at the
 * start of `computeState` in `computePropertiesIncremental.ts` (covers Kafka-only ingest).
 *
 * Query latency baseline for an optional CH dictionary over `identity_links_latest_v1` has not been captured (deferred).
 */
export async function reconcileLinkedAnonymousUserTables(
  workspaceId: string,
): Promise<void> {
  const qb = new ClickHouseQueryBuilder();
  const w = qb.addQueryValue(workspaceId, "String");
  const linkedAnonSubquery = `SELECT anonymous_id FROM ${IDENTITY_LINKS_LATEST_TABLE} FINAL WHERE workspace_id = ${w}`;
  const tables = [
    "computed_property_assignments_v2",
    "processed_computed_properties_v2",
    "computed_property_state_v3",
    "computed_property_state_index",
    "resolved_segment_state",
  ] as const;
  for (const table of tables) {
    // eslint-disable-next-line no-await-in-loop
    await chCommand({
      query: `DELETE FROM ${table} WHERE workspace_id = ${w} AND user_id IN (${linkedAnonSubquery}) ${lightweightDeleteSettings}`,
      query_params: qb.getQueries(),
      clickhouse_settings: { wait_end_of_query: 1 },
    });
  }
}

const lastReconcileMsByWorkspace = new Map<string, number>();
const RECONCILE_THROTTLE_MS = 60_000;

/** Coarse throttle so Kafka-only workspaces still converge without DELETE on every compute tick. */
export async function reconcileLinkedAnonymousUserTablesThrottled(
  workspaceId: string,
): Promise<void> {
  const now = Date.now();
  const prev = lastReconcileMsByWorkspace.get(workspaceId) ?? 0;
  if (now - prev < RECONCILE_THROTTLE_MS) {
    return;
  }
  lastReconcileMsByWorkspace.set(workspaceId, now);
  await reconcileLinkedAnonymousUserTables(workspaceId);
}
