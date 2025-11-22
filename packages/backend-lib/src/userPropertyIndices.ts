import { and, eq } from "drizzle-orm";

import { clickhouseClient } from "./clickhouse";
import { db } from "./db";
import { userPropertyIndex } from "./db/schema";
import logger from "./logger";

export type UserPropertyIndexType = "String" | "Number" | "Date";

async function pruneIndex({
  workspaceId,
  userPropertyId,
  type,
}: {
  workspaceId: string;
  userPropertyId: string;
  type: UserPropertyIndexType;
}) {
  let table = "";
  if (type === "Number") table = "user_property_idx_num";
  else if (type === "String") table = "user_property_idx_str";
  else if (type === "Date") table = "user_property_idx_date";

  if (!table) {
    logger().warn(
      { workspaceId, userPropertyId, type },
      "Unknown index type for pruning",
    );
    return;
  }

  // Lightweight Delete
  await clickhouseClient().command({
    query: `DELETE FROM ${table} WHERE workspace_id = {workspaceId:String} AND computed_property_id = {userPropertyId:String} SETTINGS mutations_sync = 0, lightweight_deletes_sync = 0`,
    query_params: { workspaceId, userPropertyId },
  });

  logger().info(
    { workspaceId, userPropertyId, type, table },
    "Pruned index table",
  );
}

async function backfillIndex({
  workspaceId,
  userPropertyId,
  type,
}: {
  workspaceId: string;
  userPropertyId: string;
  type: UserPropertyIndexType;
}) {
  let targetTable = "";
  let valueExtractor = "";
  let valueColumn = "";

  if (type === "Number") {
    targetTable = "user_property_idx_num";
    valueExtractor = "JSONExtractFloat(user_property_value)";
    valueColumn = "value_num";
  } else if (type === "String") {
    targetTable = "user_property_idx_str";
    valueExtractor = "trim(BOTH '\"' FROM user_property_value)";
    valueColumn = "value_str";
  } else if (type === "Date") {
    targetTable = "user_property_idx_date";
    valueExtractor =
      "parseDateTime64BestEffortOrNull(trim(BOTH '\"' FROM user_property_value), 3)";
    valueColumn = "value_date";
  }

  if (!targetTable) {
    logger().warn(
      { workspaceId, userPropertyId, type },
      "Unknown index type for backfill",
    );
    return;
  }

  const query = `
    INSERT INTO ${targetTable} (workspace_id, computed_property_id, user_id, ${valueColumn}, assigned_at)
    SELECT
      workspace_id,
      computed_property_id,
      user_id,
      ${valueExtractor} as ${valueColumn},
      assigned_at
    FROM computed_property_assignments_v2
    WHERE workspace_id = {workspaceId:String}
      AND computed_property_id = {userPropertyId:String}
      AND type = 'user_property'
      AND isNotNull(${valueColumn})
  `;

  await clickhouseClient().command({
    query,
    query_params: { workspaceId, userPropertyId },
  });

  logger().info(
    { workspaceId, userPropertyId, type, targetTable },
    "Backfilled index table",
  );
}

export async function upsertUserPropertyIndex({
  workspaceId,
  userPropertyId,
  type,
}: {
  workspaceId: string;
  userPropertyId: string;
  type: UserPropertyIndexType;
}) {
  // 1. Fetch existing state (No transaction needed for read)
  const existing = await db().query.userPropertyIndex.findFirst({
    where: and(
      eq(userPropertyIndex.workspaceId, workspaceId),
      eq(userPropertyIndex.userPropertyId, userPropertyId),
    ),
  });

  // 2. Update Postgres Source of Truth
  await db()
    .insert(userPropertyIndex)
    .values({ workspaceId, userPropertyId, type })
    .onConflictDoUpdate({
      target: userPropertyIndex.userPropertyId,
      set: { type, updatedAt: new Date() },
    });

  logger().info(
    { workspaceId, userPropertyId, type, existing: !!existing },
    "Upserted user property index in Postgres",
  );

  // 3. Perform ClickHouse Operations (Sequentially, outside PG transaction)

  // A. Update Config (Allow MV to process new events)
  await clickhouseClient().insert({
    table: "user_property_index_config",
    values: [{ workspace_id: workspaceId, user_property_id: userPropertyId, type }],
    format: "JSONEachRow",
  });

  logger().info(
    { workspaceId, userPropertyId, type },
    "Updated ClickHouse config table",
  );

  // B. Handle Type Change (Prune old data if type switched)
  if (existing && existing.type !== type) {
    await pruneIndex({
      workspaceId,
      userPropertyId,
      type: existing.type as UserPropertyIndexType,
    });
  }

  // C. Backfill (Populate index with existing data)
  if (!existing || existing.type !== type) {
    await backfillIndex({ workspaceId, userPropertyId, type });
  }

  logger().info(
    { workspaceId, userPropertyId, type },
    "Completed user property index upsert",
  );
}

export async function deleteUserPropertyIndex({
  workspaceId,
  userPropertyId,
}: {
  workspaceId: string;
  userPropertyId: string;
}) {
  const existing = await db().query.userPropertyIndex.findFirst({
    where: and(
      eq(userPropertyIndex.workspaceId, workspaceId),
      eq(userPropertyIndex.userPropertyId, userPropertyId),
    ),
  });

  if (!existing) {
    logger().info(
      { workspaceId, userPropertyId },
      "No index found to delete",
    );
    return;
  }

  // 1. Delete from Postgres
  await db().delete(userPropertyIndex).where(eq(userPropertyIndex.id, existing.id));

  logger().info(
    { workspaceId, userPropertyId },
    "Deleted user property index from Postgres",
  );

  // 2. Remove from ClickHouse Config
  await clickhouseClient().command({
    query: `DELETE FROM user_property_index_config WHERE workspace_id = {workspaceId:String} AND user_property_id = {userPropertyId:String}`,
    query_params: { workspaceId, userPropertyId },
  });

  logger().info(
    { workspaceId, userPropertyId },
    "Removed from ClickHouse config table",
  );

  // 3. Prune Data
  await pruneIndex({
    workspaceId,
    userPropertyId,
    type: existing.type as UserPropertyIndexType,
  });

  logger().info(
    { workspaceId, userPropertyId },
    "Completed user property index deletion",
  );
}

export async function getUserPropertyIndices({
  workspaceId,
}: {
  workspaceId: string;
}) {
  return db().query.userPropertyIndex.findMany({
    where: eq(userPropertyIndex.workspaceId, workspaceId),
  });
}
