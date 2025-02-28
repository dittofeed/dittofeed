import { ClickHouseQueryBuilder, query as chQuery } from "./clickhouse";

export async function getUsersForGroup({
  workspaceId,
  groupId,
  limit = 100,
  offset = 0,
}: {
  workspaceId: string;
  groupId: string;
  limit?: number;
  offset?: number;
}): Promise<string[]> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const groupIdParam = qb.addQueryValue(groupId, "String");
  const limitParam = qb.addQueryValue(limit, "UInt64");
  const offsetParam = qb.addQueryValue(offset, "UInt64");
  const query = `
    SELECT
      user_id
    FROM
      group_user_assignments
    WHERE
      workspace_id = ${workspaceIdParam}
      AND group_id = ${groupIdParam}
    GROUP BY
      workspace_id, group_id, user_id, assigned_at
    HAVING
      assigned = true
    ORDER BY assigned_at DESC
    LIMIT ${limitParam}
    OFFSET ${offsetParam}
  `;
  const result = await chQuery({
    query,
    query_params: qb.getQueries(),
  });
  const rows = await result.json<{ user_id: string }>();
  return rows.map((row) => row.user_id);
}

export async function getGroupsForUser({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<string[]> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const userIdParam = qb.addQueryValue(userId, "String");
  const query = `
    SELECT
      group_id
    FROM
      user_group_assignments
    WHERE
      workspace_id = ${workspaceIdParam}
      AND user_id = ${userIdParam}
    GROUP BY
      workspace_id, user_id, group_id, assigned_at
    HAVING
      assigned = true
    ORDER BY assigned_at DESC
  `;
  const result = await chQuery({
    query,
    query_params: qb.getQueries(),
  });
  const rows = await result.json<{ group_id: string }>();
  return rows.map((row) => row.group_id);
}
