import { ClickHouseQueryBuilder, command } from "backend-lib/src/clickhouse";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";

export async function resetWorkspaceData({
  workspaceId,
}: {
  workspaceId: string;
}) {
  logger().info(
    {
      workspaceId,
    },
    "Resetting workspace data for workspace",
  );

  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const baseChParams = {
    query_params: qb.getQueries(),
    settings: {
      wait_end_of_query: 1,
    },
  };

  await Promise.all([
    command({
      query: `ALTER TABLE user_events_v2 DELETE WHERE workspace_id = ${workspaceIdParam}`,
      ...baseChParams,
    }),
    command({
      query: `ALTER TABLE computed_property_state_v2 DELETE WHERE workspace_id = ${workspaceIdParam}`,
      ...baseChParams,
    }),
    command({
      query: `ALTER TABLE computed_property_assignments_v2 DELETE WHERE workspace_id = ${workspaceIdParam}`,
      ...baseChParams,
    }),
    command({
      query: `ALTER TABLE processed_computed_properties_v2 DELETE WHERE workspace_id = ${workspaceIdParam}`,
      ...baseChParams,
    }),
    command({
      query: `ALTER TABLE updated_computed_property_state DELETE WHERE workspace_id = ${workspaceIdParam}`,
      ...baseChParams,
    }),
    command({
      query: `ALTER TABLE updated_property_assignments_v2 DELETE WHERE workspace_id = ${workspaceIdParam}`,
      ...baseChParams,
    }),
    command({
      query: `ALTER TABLE computed_property_state_index DELETE WHERE workspace_id = ${workspaceIdParam}`,
      ...baseChParams,
    }),
    command({
      query: `ALTER TABLE resolved_segment_state DELETE WHERE workspace_id = ${workspaceIdParam}`,
      ...baseChParams,
    }),
  ]);

  await Promise.all([
    prisma().segmentAssignment.deleteMany({
      where: {
        workspaceId,
      },
    }),
    prisma().userPropertyAssignment.deleteMany({
      where: {
        workspaceId,
      },
    }),
  ]);

  logger().info(
    {
      workspaceId,
    },
    "Finished resetting workspace data for workspace",
  );
}
