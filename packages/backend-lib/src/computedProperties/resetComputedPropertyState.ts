import { ClickHouseQueryBuilder, command } from "../clickhouse";
import { db } from "../db";
import {
  computedPropertyPeriod,
  segment,
  segmentAssignment,
  userProperty,
  userPropertyAssignment,
} from "../db/schema";
import logger from "../logger";
import { and, eq } from "drizzle-orm";

const DELETE_SETTINGS =
  "settings mutations_sync = 1, lightweight_deletes_sync = 1";

async function deleteClickhouseSegmentState({
  workspaceId,
  segmentId,
}: {
  workspaceId: string;
  segmentId: string;
}) {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const segmentIdParam = qb.addQueryValue(segmentId, "String");

  const queries = [
    `DELETE FROM computed_property_state_v3
      WHERE workspace_id = ${workspaceIdParam}
        AND type = 'segment'
        AND computed_property_id = ${segmentIdParam}
      ${DELETE_SETTINGS}`,
    `DELETE FROM resolved_segment_state
      WHERE workspace_id = ${workspaceIdParam}
        AND segment_id = ${segmentIdParam}
      ${DELETE_SETTINGS}`,
    `DELETE FROM computed_property_assignments_v2
      WHERE workspace_id = ${workspaceIdParam}
        AND type = 'segment'
        AND computed_property_id = ${segmentIdParam}
      ${DELETE_SETTINGS}`,
    `DELETE FROM computed_property_state_index
      WHERE workspace_id = ${workspaceIdParam}
        AND type = 'segment'
        AND computed_property_id = ${segmentIdParam}
      ${DELETE_SETTINGS}`,
    `DELETE FROM processed_computed_properties_v2
      WHERE workspace_id = ${workspaceIdParam}
        AND type = 'segment'
        AND computed_property_id = ${segmentIdParam}
      ${DELETE_SETTINGS}`,
  ];

  for (const query of queries) {
    await command({
      query,
      query_params: qb.getQueries(),
      clickhouse_settings: { wait_end_of_query: 1 },
    });
  }
}

async function deleteClickhouseUserPropertyState({
  workspaceId,
  userPropertyId,
}: {
  workspaceId: string;
  userPropertyId: string;
}) {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const userPropertyIdParam = qb.addQueryValue(userPropertyId, "String");

  const queries = [
    `DELETE FROM computed_property_state_v3
      WHERE workspace_id = ${workspaceIdParam}
        AND type = 'user_property'
        AND computed_property_id = ${userPropertyIdParam}
      ${DELETE_SETTINGS}`,
    `DELETE FROM computed_property_assignments_v2
      WHERE workspace_id = ${workspaceIdParam}
        AND type = 'user_property'
        AND computed_property_id = ${userPropertyIdParam}
      ${DELETE_SETTINGS}`,
    `DELETE FROM computed_property_state_index
      WHERE workspace_id = ${workspaceIdParam}
        AND type = 'user_property'
        AND computed_property_id = ${userPropertyIdParam}
      ${DELETE_SETTINGS}`,
    `DELETE FROM processed_computed_properties_v2
      WHERE workspace_id = ${workspaceIdParam}
        AND type = 'user_property'
        AND computed_property_id = ${userPropertyIdParam}
      ${DELETE_SETTINGS}`,
  ];

  for (const query of queries) {
    await command({
      query,
      query_params: qb.getQueries(),
      clickhouse_settings: { wait_end_of_query: 1 },
    });
  }
}

async function deleteComputedPropertyPeriods({
  workspaceId,
  computedPropertyId,
  type,
}: {
  workspaceId: string;
  computedPropertyId: string;
  type: "Segment" | "UserProperty";
}) {
  await db()
    .delete(computedPropertyPeriod)
    .where(
      and(
        eq(computedPropertyPeriod.workspaceId, workspaceId),
        eq(computedPropertyPeriod.computedPropertyId, computedPropertyId),
        eq(computedPropertyPeriod.type, type),
      ),
    );
}

export async function resetSegmentComputedState({
  workspaceId,
  segmentId,
  refreshDefinitionUpdatedAt = true,
}: {
  workspaceId: string;
  segmentId: string;
  refreshDefinitionUpdatedAt?: boolean;
}) {
  logger().info(
    { workspaceId, segmentId, refreshDefinitionUpdatedAt },
    "Resetting segment computed property state",
  );

  await deleteClickhouseSegmentState({ workspaceId, segmentId });

  await db()
    .delete(segmentAssignment)
    .where(
      and(
        eq(segmentAssignment.workspaceId, workspaceId),
        eq(segmentAssignment.segmentId, segmentId),
      ),
    );

  await deleteComputedPropertyPeriods({
    workspaceId,
    computedPropertyId: segmentId,
    type: "Segment",
  });

  if (refreshDefinitionUpdatedAt) {
    const now = new Date();
    await db()
      .update(segment)
      .set({
        definitionUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(segment.id, segmentId));
  }

  logger().info(
    { workspaceId, segmentId },
    "Finished resetting segment computed property state",
  );
}

export async function resetUserPropertyComputedState({
  workspaceId,
  userPropertyId,
  refreshDefinitionUpdatedAt = true,
}: {
  workspaceId: string;
  userPropertyId: string;
  refreshDefinitionUpdatedAt?: boolean;
}) {
  logger().info(
    { workspaceId, userPropertyId, refreshDefinitionUpdatedAt },
    "Resetting user property computed state",
  );

  await deleteClickhouseUserPropertyState({ workspaceId, userPropertyId });

  await db()
    .delete(userPropertyAssignment)
    .where(
      and(
        eq(userPropertyAssignment.workspaceId, workspaceId),
        eq(userPropertyAssignment.userPropertyId, userPropertyId),
      ),
    );

  await deleteComputedPropertyPeriods({
    workspaceId,
    computedPropertyId: userPropertyId,
    type: "UserProperty",
  });

  if (refreshDefinitionUpdatedAt) {
    const now = new Date();
    await db()
      .update(userProperty)
      .set({
        definitionUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(userProperty.id, userPropertyId));
  }

  logger().info(
    { workspaceId, userPropertyId },
    "Finished resetting user property computed state",
  );
}
