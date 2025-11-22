import { and, eq } from "drizzle-orm";

import { clickhouseClient } from "./clickhouse";
import { db, txQueryResult } from "./db";
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
  let table: string;
  if (type === "Number") {
    table = "user_property_idx_num";
  } else if (type === "String") {
    table = "user_property_idx_str";
  } else {
    table = "user_property_idx_date";
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
  let targetTable: string;
  let valueExtractor: string;
  let valueColumn: string;

  if (type === "Number") {
    targetTable = "user_property_idx_num";
    valueExtractor = "JSONExtractFloat(user_property_value)";
    valueColumn = "value_num";
  } else if (type === "String") {
    targetTable = "user_property_idx_str";
    valueExtractor = "trim(BOTH '\"' FROM user_property_value)";
    valueColumn = "value_str";
  } else {
    targetTable = "user_property_idx_date";
    valueExtractor =
      "parseDateTime64BestEffortOrNull(trim(BOTH '\"' FROM user_property_value), 3)";
    valueColumn = "value_date";
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
  // 1. Fetch existing state and update Postgres in transaction
  const { existing } = await db().transaction(async (tx) => {
    const existingIndex = await tx.query.userPropertyIndex.findFirst({
      where: and(
        eq(userPropertyIndex.workspaceId, workspaceId),
        eq(userPropertyIndex.userPropertyId, userPropertyId),
      ),
    });

    if (!existingIndex) {
      const [newIndex] = await tx
        .insert(userPropertyIndex)
        .values({ workspaceId, userPropertyId, type })
        .returning();

      if (!newIndex) {
        throw new Error("Failed to create new user property index");
      }
      return { existing: null };
    }

    // Update Postgres Source of Truth
    const [updatedIndex] = await tx
      .update(userPropertyIndex)
      .set({ type })
      .where(
        and(
          eq(userPropertyIndex.id, existingIndex.id),
          eq(userPropertyIndex.workspaceId, workspaceId),
          eq(userPropertyIndex.userPropertyId, userPropertyId),
        ),
      )
      .returning();

    if (!updatedIndex) {
      throw new Error("Failed to update user property index");
    }
    return { existing: updatedIndex };
  });

  // 2. Perform ClickHouse Operations (Sequentially, outside PG transaction)

  // A. Update Config (Allow MV to process new events)
  await clickhouseClient().insert({
    table: "user_property_index_config",
    values: [
      { workspace_id: workspaceId, user_property_id: userPropertyId, type },
    ],
    format: "JSONEachRow",
  });

  // B. Handle Type Change (Prune old data if type switched)
  if (existing && existing.type !== type) {
    await pruneIndex({
      workspaceId,
      userPropertyId,
      type: existing.type,
    });
  }

  // C. Backfill (Populate index with existing data)
  if (!existing || existing.type !== type) {
    await backfillIndex({ workspaceId, userPropertyId, type });
  }
}

export async function deleteUserPropertyIndex({
  workspaceId,
  userPropertyId,
}: {
  workspaceId: string;
  userPropertyId: string;
}) {
  // 1. Fetch existing state and delete from Postgres in transaction
  const { existing } = await db().transaction(async (tx) => {
    const existingIndex = await tx.query.userPropertyIndex.findFirst({
      where: and(
        eq(userPropertyIndex.workspaceId, workspaceId),
        eq(userPropertyIndex.userPropertyId, userPropertyId),
      ),
    });

    if (!existingIndex) {
      return { existing: null };
    }

    // Delete from Postgres
    const deleteResult = await txQueryResult(
      tx
        .delete(userPropertyIndex)
        .where(eq(userPropertyIndex.id, existingIndex.id)),
    );

    if (deleteResult.isErr()) {
      logger().error(
        { err: deleteResult.error, workspaceId, userPropertyId },
        "Failed to delete user property index from Postgres",
      );
      throw new Error("Failed to delete user property index from Postgres");
    }

    return { existing: existingIndex };
  });

  if (!existing) {
    logger().info({ workspaceId, userPropertyId }, "No index found to delete");
    return;
  }

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
  const indices = await db().query.userPropertyIndex.findMany({
    where: eq(userPropertyIndex.workspaceId, workspaceId),
  });
  return indices;
}
