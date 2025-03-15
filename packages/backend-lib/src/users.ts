import { Static, Type } from "@sinclair/typebox";
import { and, eq, inArray } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  schemaValidate,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { parseUserProperty } from "isomorphic-lib/src/userProperties";
import { ok, Result } from "neverthrow";

import {
  ClickHouseQueryBuilder,
  command as chCommand,
  query as chQuery,
} from "./clickhouse";
import { db } from "./db";
import {
  segment as dbSegment,
  segmentAssignment as dbSegmentAssignment,
  userProperty as dbUserProperty,
  userPropertyAssignment as dbUserPropertyAssignment,
} from "./db/schema";
import logger from "./logger";
import { deserializeCursor, serializeCursor } from "./pagination";
import {
  CursorDirectionEnum,
  DBResourceTypeEnum,
  DeleteUsersRequest,
  GetUsersCountResponse,
  GetUsersRequest,
  GetUsersResponse,
  GetUsersResponseItem,
  UserProperty,
  UserPropertyDefinition,
} from "./types";

enum CursorKey {
  UserIdKey = "u",
}

const Cursor = Type.Object({
  [CursorKey.UserIdKey]: Type.String(),
});

type Cursor = Static<typeof Cursor>;

function serializeUserCursor(cursor: Cursor): string {
  return serializeCursor(cursor);
}

export async function getUsers({
  workspaceId,
  cursor: unparsedCursor,
  segmentFilter,
  userIds,
  userPropertyFilter,
  direction = CursorDirectionEnum.After,
  limit = 10,
}: GetUsersRequest): Promise<Result<GetUsersResponse, Error>> {
  // TODO implement alternate sorting
  let cursor: Cursor | null = null;
  if (unparsedCursor) {
    try {
      const decoded = deserializeCursor(unparsedCursor);
      cursor = unwrap(schemaValidate(decoded, Cursor));
    } catch (e) {
      logger().error(
        {
          err: e,
        },
        "failed to decode user cursor",
      );
    }
  }

  const qb = new ClickHouseQueryBuilder();
  const cursorClause = cursor
    ? `and user_id ${
        direction === CursorDirectionEnum.After ? ">" : "<"
      } ${qb.addQueryValue(cursor[CursorKey.UserIdKey], "String")}`
    : "";

  const userPropertyWhereClause = userPropertyFilter
    ? `AND computed_property_id IN ${qb.addQueryValue(
        userPropertyFilter.map((property) => property.id),
        "Array(String)",
      )}`
    : "";
  const segmentWhereClause = segmentFilter
    ? `AND computed_property_id IN ${qb.addQueryValue(
        segmentFilter,
        "Array(String)",
      )}`
    : "";

  const selectUserIdColumns = ["user_id"];

  const havingSubClauses: string[] = [];
  for (const property of userPropertyFilter ?? []) {
    const varName = qb.getVariableName();
    selectUserIdColumns.push(
      `argMax(if(computed_property_id = ${qb.addQueryValue(property.id, "String")}, user_property_value, null), assigned_at) as ${varName}`,
    );
    havingSubClauses.push(
      `${varName} IN (${qb.addQueryValue(property.values, "Array(String)")})`,
    );
  }
  for (const segment of segmentFilter ?? []) {
    const varName = qb.getVariableName();
    selectUserIdColumns.push(
      `argMax(if(computed_property_id = ${qb.addQueryValue(segment, "String")}, segment_value, null), assigned_at) as ${varName}`,
    );
    havingSubClauses.push(`${varName} = True`);
  }
  const havingClause =
    havingSubClauses.length > 0
      ? `HAVING ${havingSubClauses.join(" AND ")}`
      : "";
  const selectUserIdStr = selectUserIdColumns.join(", ");
  const userIdsClause = userIds
    ? `AND user_id IN (${qb.addQueryValue(userIds, "Array(String)")})`
    : "";

  const query = `
    SELECT
      assignments.user_id,
      groupArrayIf(
        (assignments.computed_property_id, assignments.last_user_property_value),
        assignments.type = 'user_property'
      ) AS user_properties,
      groupArrayIf(
        (assignments.computed_property_id, assignments.last_segment_value),
        assignments.type = 'segment'
      ) AS segments
    FROM (
      SELECT
          cp.user_id,
          cp.computed_property_id,
          cp.type,
          argMax(user_property_value, assigned_at) AS last_user_property_value,
          argMax(segment_value, assigned_at) AS last_segment_value
      FROM computed_property_assignments_v2 cp
      WHERE
        cp.workspace_id = ${qb.addQueryValue(workspaceId, "String")}
        AND cp.user_id IN (SELECT user_id FROM (
          SELECT
            ${selectUserIdStr}
          FROM computed_property_assignments_v2
          WHERE
            workspace_id = ${qb.addQueryValue(workspaceId, "String")}
            ${cursorClause}
            ${userPropertyWhereClause}
            ${segmentWhereClause}
            ${userIdsClause}
          GROUP BY workspace_id, user_id
          ${havingClause}
          ORDER BY
            user_id ASC
          LIMIT ${limit}
        ))
      GROUP BY cp.user_id, cp.computed_property_id, cp.type
    ) as assignments
    GROUP BY assignments.user_id
    ORDER BY
      assignments.user_id ASC
  `;

  const [results, userProperties, segments] = await Promise.all([
    chQuery({
      query,
      query_params: qb.getQueries(),
    }),
    db()
      .select({
        name: dbUserProperty.name,
        id: dbUserProperty.id,
        definition: dbUserProperty.definition,
      })
      .from(dbUserProperty)
      .where(
        and(
          eq(dbUserProperty.workspaceId, workspaceId),
          eq(dbUserProperty.resourceType, DBResourceTypeEnum.Declarative),
        ),
      ),
    db()
      .select({
        name: dbSegment.name,
        id: dbSegment.id,
        definition: dbSegment.definition,
      })
      .from(dbSegment)
      .where(
        and(
          eq(dbSegment.workspaceId, workspaceId),
          eq(dbSegment.resourceType, DBResourceTypeEnum.Declarative),
        ),
      ),
  ]);
  const segmentNameById = new Map<string, string>();
  for (const segment of segments) {
    segmentNameById.set(segment.id, segment.name);
  }
  const userPropertyById = new Map<
    string,
    Pick<UserProperty, "id" | "name"> & {
      definition: UserPropertyDefinition;
    }
  >();
  for (const property of userProperties) {
    const definition = schemaValidateWithErr(
      property.definition,
      UserPropertyDefinition,
    );
    if (definition.isErr()) {
      logger().error(
        {
          err: definition.error,
          id: property.id,
          workspaceId,
        },
        "failed to validate user property definition",
      );
      continue;
    }
    userPropertyById.set(property.id, {
      id: property.id,
      name: property.name,
      definition: definition.value,
    });
  }

  const rows = await results.json<{
    user_id: string;
    segments: [string, string][];
    user_properties: [string, string][];
  }>();
  const users: GetUsersResponseItem[] = rows.map((row) => {
    const userSegments: GetUsersResponseItem["segments"] = row.segments.flatMap(
      ([id, value]) => {
        const name = segmentNameById.get(id);
        if (!name || !value) {
          logger().error(
            {
              id,
              workspaceId,
            },
            "segment not found",
          );
          return [];
        }
        return {
          id,
          name,
        };
      },
    );
    const properties: GetUsersResponseItem["properties"] =
      row.user_properties.reduce<GetUsersResponseItem["properties"]>(
        (acc, [id, value]) => {
          const up = userPropertyById.get(id);
          if (!up) {
            logger().error(
              {
                id,
                workspaceId,
              },
              "user property not found",
            );
            return acc;
          }
          const parsedValue = parseUserProperty(up.definition, value);
          if (parsedValue.isErr()) {
            logger().error(
              {
                err: parsedValue.error,
                id,
                workspaceId,
              },
              "failed to parse user property value",
            );
            return acc;
          }
          acc[id] = {
            name: up.name,
            value: parsedValue.value,
          };
          return acc;
        },
        {},
      );
    const user: GetUsersResponseItem = {
      id: row.user_id,
      segments: userSegments,
      properties,
    };
    return user;
  });

  const lastResult = users[users.length - 1];
  const firstResult = users[0];

  let nextCursor: Cursor | null;
  let previousCursor: Cursor | null;

  if (lastResult && users.length >= limit) {
    nextCursor = {
      [CursorKey.UserIdKey]: lastResult.id,
    };
  } else {
    nextCursor = null;
  }

  if (firstResult && cursor) {
    previousCursor = {
      [CursorKey.UserIdKey]: firstResult.id,
    };
  } else {
    previousCursor = null;
  }

  const val: GetUsersResponse = {
    users,
    userCount: 0,
  };

  if (nextCursor) {
    val.nextCursor = serializeUserCursor(nextCursor);
  }
  if (previousCursor) {
    val.previousCursor = serializeUserCursor(previousCursor);
  }

  return ok(val);
}

export async function deleteUsers({
  workspaceId,
  userIds,
}: DeleteUsersRequest): Promise<void> {
  const qb = new ClickHouseQueryBuilder();

  // Define shared query values
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const userIdsParam = qb.addQueryValue(userIds, "Array(String)");

  const queries = [
    // Delete from user_events_v2
    `ALTER TABLE user_events_v2 DELETE WHERE workspace_id = ${workspaceIdParam}
     AND user_id IN (${userIdsParam});`,

    // Delete from computed_property_state_v2
    `ALTER TABLE computed_property_state_v2 DELETE WHERE workspace_id = ${workspaceIdParam}
     AND user_id IN (${userIdsParam});`,

    // Delete from computed_property_assignments_v2
    `ALTER TABLE computed_property_assignments_v2 DELETE WHERE workspace_id = ${workspaceIdParam}
     AND user_id IN (${userIdsParam});`,

    // Delete from processed_computed_properties_v2
    `ALTER TABLE processed_computed_properties_v2 DELETE WHERE workspace_id = ${workspaceIdParam}
     AND user_id IN (${userIdsParam});`,

    // Delete from computed_property_state_index
    `ALTER TABLE computed_property_state_index DELETE WHERE workspace_id = ${workspaceIdParam}
     AND user_id IN (${userIdsParam});`,

    // Delete from resolved_segment_state
    `ALTER TABLE resolved_segment_state DELETE WHERE workspace_id = ${workspaceIdParam}
     AND user_id IN (${userIdsParam});`,
  ];

  await Promise.all([
    // Execute all Clickhouse deletion queries
    ...queries.map((query) =>
      chCommand({
        query,
        query_params: qb.getQueries(),
        clickhouse_settings: {
          wait_end_of_query: 1,
          mutations_sync: "1",
        },
      }),
    ),
    // Delete from postgres tables
    db()
      .delete(dbUserPropertyAssignment)
      .where(
        and(
          eq(dbUserPropertyAssignment.workspaceId, workspaceId),
          inArray(dbUserPropertyAssignment.userId, userIds),
        ),
      ),
    db()
      .delete(dbSegmentAssignment)
      .where(
        and(
          eq(dbSegmentAssignment.workspaceId, workspaceId),
          inArray(dbSegmentAssignment.userId, userIds),
        ),
      ),
  ]);
}

export async function getUsersCount({
  workspaceId,
  segmentFilter,
  userIds,
  userPropertyFilter,
}: Omit<GetUsersRequest, "cursor" | "direction" | "limit">): Promise<
  Result<GetUsersCountResponse, Error>
> {
  const qb = new ClickHouseQueryBuilder();

  const userPropertyWhereClause = userPropertyFilter
    ? `AND computed_property_id IN ${qb.addQueryValue(
        userPropertyFilter.map((property) => property.id),
        "Array(String)",
      )}`
    : "";
  const segmentWhereClause = segmentFilter
    ? `AND computed_property_id IN ${qb.addQueryValue(
        segmentFilter,
        "Array(String)",
      )}`
    : "";

  const selectUserIdColumns = ["user_id"];

  const havingSubClauses: string[] = [];
  for (const property of userPropertyFilter ?? []) {
    const varName = qb.getVariableName();
    selectUserIdColumns.push(
      `argMax(if(computed_property_id = ${qb.addQueryValue(property.id, "String")}, user_property_value, null), assigned_at) as ${varName}`,
    );
    havingSubClauses.push(
      `${varName} IN (${qb.addQueryValue(property.values, "Array(String)")})`,
    );
  }
  for (const segment of segmentFilter ?? []) {
    const varName = qb.getVariableName();
    selectUserIdColumns.push(
      `argMax(if(computed_property_id = ${qb.addQueryValue(segment, "String")}, segment_value, null), assigned_at) as ${varName}`,
    );
    havingSubClauses.push(`${varName} = True`);
  }
  const havingClause =
    havingSubClauses.length > 0
      ? `HAVING ${havingSubClauses.join(" AND ")}`
      : "";
  const selectUserIdStr = selectUserIdColumns.join(", ");
  const userIdsClause = userIds
    ? `AND user_id IN (${qb.addQueryValue(userIds, "Array(String)")})`
    : "";

  // Using a similar nested query approach as getUsers
  const query = `
    SELECT
      uniq(user_id) as user_count
    FROM (
      SELECT
        ${selectUserIdStr}
      FROM computed_property_assignments_v2
      WHERE
        workspace_id = ${qb.addQueryValue(workspaceId, "String")}
        ${userPropertyWhereClause}
        ${segmentWhereClause}
        ${userIdsClause}
      GROUP BY workspace_id, user_id
      ${havingClause}
    )
  `;

  const results = await chQuery({
    query,
    query_params: qb.getQueries(),
  });

  const rows = await results.json<{ user_count: number }>();

  // If no rows returned, count is 0
  const userCount = rows.length > 0 ? Number(rows[0]?.user_count || 0) : 0;

  return ok({
    userCount,
  });
}
