import { Static, Type } from "@sinclair/typebox";
import { and, eq, inArray, SQL } from "drizzle-orm";
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
  subscriptionGroup as dbSubscriptionGroup,
  userProperty as dbUserProperty,
  userPropertyAssignment as dbUserPropertyAssignment,
  workspace as dbWorkspace,
} from "./db/schema";
import logger from "./logger";
import { withSpan } from "./openTelemetry";
import { deserializeCursor, serializeCursor } from "./pagination";
import {
  CursorDirectionEnum,
  DBResourceTypeEnum,
  DeleteUsersRequest,
  GetUsersCountResponse,
  GetUsersRequest,
  GetUsersResponse,
  GetUsersResponseItem,
  Segment,
  SubscriptionGroupType,
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

export async function getUsers(
  {
    workspaceId,
    cursor: unparsedCursor,
    segmentFilter,
    userIds,
    userPropertyFilter,
    direction = CursorDirectionEnum.After,
    limit = 10,
    subscriptionGroupFilter,
  }: GetUsersRequest,
  {
    allowInternalSegment = false,
    allowInternalUserProperty = false,
    throwOnError = false,
  }: {
    allowInternalSegment?: boolean;
    allowInternalUserProperty?: boolean;
    throwOnError?: boolean;
  } = {},
): Promise<Result<GetUsersResponse, Error>> {
  return withSpan({ name: "get-users" }, async (span) => {
    span.setAttribute("workspaceId", workspaceId);
    span.setAttribute("limit", limit);
    span.setAttribute("allowInternalSegment", allowInternalSegment);
    span.setAttribute("allowInternalUserProperty", allowInternalUserProperty);
    span.setAttribute("direction", direction);
    span.setAttribute("userIdsCount", userIds?.length ?? 0);
    if (subscriptionGroupFilter) {
      span.setAttribute("subscriptionGroupFilter", subscriptionGroupFilter);
    }
    if (userPropertyFilter) {
      span.setAttribute(
        "userPropertyFilter",
        userPropertyFilter.map((property) => property.id),
      );
    }
    if (segmentFilter) {
      span.setAttribute("segmentFilter", segmentFilter);
    }
    const childWorkspaceIds = (
      await db()
        .select({ id: dbWorkspace.id })
        .from(dbWorkspace)
        .where(eq(dbWorkspace.parentWorkspaceId, workspaceId))
    ).map((o) => o.id);

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
          direction === CursorDirectionEnum.After ? ">" : "<="
        } ${qb.addQueryValue(cursor[CursorKey.UserIdKey], "String")}`
      : "";

    const computedPropertyIds = [
      ...(userPropertyFilter?.map((property) => property.id) ?? []),
      ...(segmentFilter ?? []),
    ];
    const selectUserIdColumns = ["user_id"];

    const havingSubClauses: string[] = [];

    // Flag to track if we have a strict "Anchor" filter already.
    // Strict filters are those that require a specific computed_property_id to be present,
    // allowing ClickHouse to use its index efficiently.
    let hasStrictFilter = false;

    if (userPropertyFilter && userPropertyFilter.length > 0) {
      hasStrictFilter = true;
    }
    for (const property of userPropertyFilter ?? []) {
      const varName = qb.getVariableName();
      selectUserIdColumns.push(
        `argMax(if(computed_property_id = ${qb.addQueryValue(property.id, "String")}, user_property_value, null), assigned_at) as ${varName}`,
      );
      havingSubClauses.push(
        `${varName} IN (${qb.addQueryValue(property.values, "Array(String)")})`,
      );
    }

    if (segmentFilter && segmentFilter.length > 0) {
      hasStrictFilter = true;
    }
    for (const segment of segmentFilter ?? []) {
      const varName = qb.getVariableName();
      selectUserIdColumns.push(
        `argMax(if(computed_property_id = ${qb.addQueryValue(segment, "String")}, segment_value, null), assigned_at) as ${varName}`,
      );
      havingSubClauses.push(`${varName} == True`);
    }
    if (subscriptionGroupFilter) {
      const subscriptionGroupsRows = await db()
        .select({
          id: dbSubscriptionGroup.id,
          type: dbSubscriptionGroup.type,
          segmentId: dbSegment.id,
        })
        .from(dbSubscriptionGroup)
        .innerJoin(
          dbSegment,
          eq(dbSegment.subscriptionGroupId, dbSubscriptionGroup.id),
        )
        .where(inArray(dbSubscriptionGroup.id, subscriptionGroupFilter));
      const subscriptionGroups = subscriptionGroupsRows.reduce(
        (acc, subscriptionGroup) => {
          acc.set(subscriptionGroup.id, {
            type: subscriptionGroup.type as SubscriptionGroupType,
            segmentId: subscriptionGroup.segmentId,
          });
          return acc;
        },
        new Map<
          string,
          {
            type: SubscriptionGroupType;
            segmentId: string;
          }
        >(),
      );

      for (const subscriptionGroup of subscriptionGroupFilter ?? []) {
        const sg = subscriptionGroups.get(subscriptionGroup);
        if (!sg) {
          logger().error(
            {
              subscriptionGroupId: subscriptionGroup,
              workspaceId,
            },
            "subscription group not found",
          );
          if (throwOnError) {
            throw new Error("subscription group not found");
          }
          continue;
        }
        const { segmentId } = sg;

        computedPropertyIds.push(segmentId);

        const varName = qb.getVariableName();
        havingSubClauses.push(`${varName} = True`);
        selectUserIdColumns.push(
          `argMax(if(computed_property_id = ${qb.addQueryValue(segmentId, "String")}, segment_value, null), assigned_at) as ${varName}`,
        );
        hasStrictFilter = true;
      }
    }

    // [OPTIMIZATION] Implicit Anchor
    // If we have no filters (or only Opt-Out filters), we must anchor on the 'id' property
    // to prevent a full table scan. The 'id' User Property serves as a perfect index of all users.
    let addedIdAnchor = false;
    if (!hasStrictFilter) {
      const idProp = await db().query.userProperty.findFirst({
        where: and(
          eq(dbUserProperty.workspaceId, workspaceId),
          eq(dbUserProperty.name, "id"),
        ),
      });
      if (idProp) {
        computedPropertyIds.push(idProp.id);
        addedIdAnchor = true;
      }
    }

    const havingClause =
      havingSubClauses.length > 0
        ? `HAVING ${havingSubClauses.join(" AND ")}`
        : "";
    const selectedStr = selectUserIdColumns.join(", ");
    const userIdsClause = userIds
      ? `AND user_id IN (${qb.addQueryValue(userIds, "Array(String)")})`
      : "";

    // Calculate Property Types to Scan
    const propertyTypes: string[] = [];
    if (
      (segmentFilter && segmentFilter.length > 0) ||
      (subscriptionGroupFilter && subscriptionGroupFilter.length > 0)
    ) {
      propertyTypes.push("'segment'");
    }

    // We scan user_properties if requested explicitly, OR if we injected the ID anchor
    if (
      (userPropertyFilter && userPropertyFilter.length > 0) ||
      addedIdAnchor
    ) {
      propertyTypes.push("'user_property'");
    }

    const typeClause =
      propertyTypes.length > 0
        ? `AND type IN (${propertyTypes.join(", ")})`
        : "";

    // Filter the inner query to only scan rows relevant to the requested filters.
    // This allows ClickHouse to skip massive amounts of data blocks.
    const computedPropertyIdsClause =
      computedPropertyIds.length > 0
        ? `AND computed_property_id IN (${qb.addQueryValue(
            computedPropertyIds,
            "Array(String)",
          )})`
        : "";

    const workspaceIdClause =
      childWorkspaceIds.length > 0
        ? `workspace_id IN (${qb.addQueryValue(childWorkspaceIds, "Array(String)")})`
        : `workspace_id = ${qb.addQueryValue(workspaceId, "String")}`;

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
        ${workspaceIdClause}
        AND cp.user_id IN (SELECT user_id FROM (
          SELECT
            ${selectedStr}
          FROM computed_property_assignments_v2
          WHERE
            ${workspaceIdClause}
            ${cursorClause}
            ${userIdsClause}
            ${typeClause}
            ${computedPropertyIdsClause}
          GROUP BY workspace_id, user_id
          ${havingClause}
          ORDER BY
            user_id ${direction === CursorDirectionEnum.After ? "ASC" : "DESC"}
          LIMIT ${limit}
        ))
      GROUP BY cp.user_id, cp.computed_property_id, cp.type
    ) as assignments
    GROUP BY assignments.user_id
    ORDER BY
      assignments.user_id ASC
  `;
    const userPropertyCondition: SQL[] = [
      childWorkspaceIds.length > 0
        ? inArray(dbUserProperty.workspaceId, childWorkspaceIds)
        : eq(dbUserProperty.workspaceId, workspaceId),
    ];
    if (!allowInternalUserProperty) {
      userPropertyCondition.push(
        eq(dbUserProperty.resourceType, DBResourceTypeEnum.Declarative),
      );
    }

    const segmentCondition =
      childWorkspaceIds.length > 0
        ? inArray(dbSegment.workspaceId, childWorkspaceIds)
        : eq(dbSegment.workspaceId, workspaceId);
    const [results, userProperties, segments] = await Promise.all([
      chQuery({
        query,
        query_params: qb.getQueries(),
        clickhouse_settings: {
          output_format_json_named_tuples_as_objects: 0,
        },
      }),
      db()
        .select({
          name: dbUserProperty.name,
          id: dbUserProperty.id,
          definition: dbUserProperty.definition,
        })
        .from(dbUserProperty)
        .where(and(...userPropertyCondition)),
      db().select().from(dbSegment).where(segmentCondition),
    ]);
    const segmentNameById = new Map<string, Segment>();
    for (const segment of segments) {
      segmentNameById.set(segment.id, segment);
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
        if (throwOnError) {
          throw definition.error;
        }
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
    logger().debug(
      {
        rows,
      },
      "get users rows",
    );
    const users: GetUsersResponseItem[] = rows.map((row) => {
      const userSegments: GetUsersResponseItem["segments"] =
        row.segments.flatMap(([id, value]) => {
          const segment = segmentNameById.get(id);
          if (!segment || !value) {
            logger().error(
              {
                id,
                workspaceId,
              },
              "segment not found",
            );
            return [];
          }
          if (!allowInternalSegment && segment.resourceType === "Internal") {
            logger().debug(
              {
                segment,
                workspaceId,
              },
              "skipping internal segment",
            );
            return [];
          }
          return {
            id,
            name: segment.name,
          };
        });
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
              if (throwOnError) {
                throw new Error("user property not found");
              }
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
              if (throwOnError) {
                throw new Error("failed to parse user property value");
              }
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

    span.setAttribute("usersCount", users.length);

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
  });
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
    `DELETE FROM user_events_v2 WHERE workspace_id = ${workspaceIdParam}
     AND user_id IN (${userIdsParam}) settings mutations_sync = 0, lightweight_deletes_sync = 0;`,

    // Delete from computed_property_state_v3
    `DELETE FROM computed_property_state_v3 WHERE workspace_id = ${workspaceIdParam}
     AND user_id IN (${userIdsParam}) settings mutations_sync = 0, lightweight_deletes_sync = 0;`,

    // Delete from computed_property_assignments_v2
    `DELETE FROM computed_property_assignments_v2 WHERE workspace_id = ${workspaceIdParam}
     AND user_id IN (${userIdsParam}) settings mutations_sync = 0, lightweight_deletes_sync = 0;`,

    // Delete from processed_computed_properties_v2
    `DELETE FROM processed_computed_properties_v2 WHERE workspace_id = ${workspaceIdParam}
     AND user_id IN (${userIdsParam}) settings mutations_sync = 0, lightweight_deletes_sync = 0;`,

    // Delete from computed_property_state_index
    `DELETE FROM computed_property_state_index WHERE workspace_id = ${workspaceIdParam}
     AND user_id IN (${userIdsParam}) settings mutations_sync = 0, lightweight_deletes_sync = 0;`,

    // Delete from resolved_segment_state
    `DELETE FROM resolved_segment_state WHERE workspace_id = ${workspaceIdParam}
     AND user_id IN (${userIdsParam}) settings mutations_sync = 0, lightweight_deletes_sync = 0;`,

    // Delete from internal_events
    `DELETE FROM internal_events WHERE workspace_id = ${workspaceIdParam}
     AND user_id IN (${userIdsParam}) settings mutations_sync = 0, lightweight_deletes_sync = 0;`,
  ];

  await Promise.all([
    // Execute all Clickhouse deletion queries
    ...queries.map((query) =>
      chCommand({
        query,
        query_params: qb.getQueries(),
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

export async function deleteAllUsers({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const qb = new ClickHouseQueryBuilder();

  // Define shared query value
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");

  const queries = [
    // Delete from user_events_v2
    `DELETE FROM user_events_v2 WHERE workspace_id = ${workspaceIdParam}
     settings mutations_sync = 0, lightweight_deletes_sync = 0;`,

    // Delete from computed_property_state_v3
    `DELETE FROM computed_property_state_v3 WHERE workspace_id = ${workspaceIdParam}
     settings mutations_sync = 0, lightweight_deletes_sync = 0;`,

    // Delete from computed_property_assignments_v2
    `DELETE FROM computed_property_assignments_v2 WHERE workspace_id = ${workspaceIdParam}
     settings mutations_sync = 0, lightweight_deletes_sync = 0;`,

    // Delete from processed_computed_properties_v2
    `DELETE FROM processed_computed_properties_v2 WHERE workspace_id = ${workspaceIdParam}
     settings mutations_sync = 0, lightweight_deletes_sync = 0;`,

    // Delete from computed_property_state_index
    `DELETE FROM computed_property_state_index WHERE workspace_id = ${workspaceIdParam}
     settings mutations_sync = 0, lightweight_deletes_sync = 0;`,

    // Delete from resolved_segment_state
    `DELETE FROM resolved_segment_state WHERE workspace_id = ${workspaceIdParam}
     settings mutations_sync = 0, lightweight_deletes_sync = 0;`,
  ];

  await Promise.all([
    // Execute all Clickhouse deletion queries
    ...queries.map((query) =>
      chCommand({
        query,
        query_params: qb.getQueries(),
      }),
    ),
    // Delete from postgres tables
    db()
      .delete(dbUserPropertyAssignment)
      .where(eq(dbUserPropertyAssignment.workspaceId, workspaceId)),
    db()
      .delete(dbSegmentAssignment)
      .where(eq(dbSegmentAssignment.workspaceId, workspaceId)),
  ]);
}

export async function getUsersCount({
  workspaceId,
  segmentFilter,
  userIds,
  userPropertyFilter,
  subscriptionGroupFilter,
}: Omit<GetUsersRequest, "cursor" | "direction" | "limit">): Promise<
  Result<GetUsersCountResponse, Error>
> {
  const childWorkspaceIds = (
    await db()
      .select({ id: dbWorkspace.id })
      .from(dbWorkspace)
      .where(eq(dbWorkspace.parentWorkspaceId, workspaceId))
  ).map((o) => o.id);

  const qb = new ClickHouseQueryBuilder();

  const computedPropertyIds = [
    ...(userPropertyFilter?.map((property) => property.id) ?? []),
    ...(segmentFilter ?? []),
  ];

  const selectUserIdColumns = ["user_id"];

  const havingSubClauses: string[] = [];

  // Flag to track if we have a strict "Anchor" filter already.
  // Strict filters are those that require a specific computed_property_id to be present,
  // allowing ClickHouse to use its index efficiently.
  let hasStrictFilter = false;

  if (userPropertyFilter && userPropertyFilter.length > 0) {
    hasStrictFilter = true;
  }
  for (const property of userPropertyFilter ?? []) {
    const varName = qb.getVariableName();
    selectUserIdColumns.push(
      `argMax(if(computed_property_id = ${qb.addQueryValue(property.id, "String")}, user_property_value, null), assigned_at) as ${varName}`,
    );
    havingSubClauses.push(
      `${varName} IN (${qb.addQueryValue(property.values, "Array(String)")})`,
    );
  }

  if (segmentFilter && segmentFilter.length > 0) {
    hasStrictFilter = true;
  }
  for (const segment of segmentFilter ?? []) {
    const varName = qb.getVariableName();
    selectUserIdColumns.push(
      `argMax(if(computed_property_id = ${qb.addQueryValue(segment, "String")}, segment_value, null), assigned_at) as ${varName}`,
    );
    havingSubClauses.push(`${varName} = True`);
  }

  if (subscriptionGroupFilter) {
    const subscriptionGroupsRows = await db()
      .select({
        id: dbSubscriptionGroup.id,
        type: dbSubscriptionGroup.type,
        segmentId: dbSegment.id,
      })
      .from(dbSubscriptionGroup)
      .innerJoin(
        dbSegment,
        eq(dbSegment.subscriptionGroupId, dbSubscriptionGroup.id),
      )
      .where(inArray(dbSubscriptionGroup.id, subscriptionGroupFilter));
    const subscriptionGroups = subscriptionGroupsRows.reduce(
      (acc, subscriptionGroup) => {
        acc.set(subscriptionGroup.id, {
          type: subscriptionGroup.type as SubscriptionGroupType,
          segmentId: subscriptionGroup.segmentId,
        });
        return acc;
      },
      new Map<
        string,
        {
          type: SubscriptionGroupType;
          segmentId: string;
        }
      >(),
    );

    for (const subscriptionGroup of subscriptionGroupFilter ?? []) {
      const sg = subscriptionGroups.get(subscriptionGroup);
      if (!sg) {
        logger().error(
          {
            subscriptionGroupId: subscriptionGroup,
            workspaceId,
          },
          "subscription group not found",
        );
        continue;
      }
      const { segmentId } = sg;
      const varName = qb.getVariableName();
      computedPropertyIds.push(segmentId);
      selectUserIdColumns.push(
        `argMax(if(computed_property_id = ${qb.addQueryValue(segmentId, "String")}, segment_value, null), assigned_at) as ${varName}`,
      );
      havingSubClauses.push(`${varName} == True`);
      hasStrictFilter = true;
    }
  }

  // [OPTIMIZATION] Implicit Anchor
  // If we have no filters (or only Opt-Out filters), we must anchor on the 'id' property
  // to prevent a full table scan. The 'id' User Property serves as a perfect index of all users.
  let addedIdAnchor = false;
  if (!hasStrictFilter) {
    const idProp = await db().query.userProperty.findFirst({
      where: and(
        eq(dbUserProperty.workspaceId, workspaceId),
        eq(dbUserProperty.name, "id"),
      ),
    });
    if (idProp) {
      computedPropertyIds.push(idProp.id);
      addedIdAnchor = true;
    }
  }

  const havingClause =
    havingSubClauses.length > 0
      ? `HAVING ${havingSubClauses.join(" AND ")}`
      : "";
  const selectUserIdStr = selectUserIdColumns.join(", ");
  const userIdsClause = userIds
    ? `AND user_id IN (${qb.addQueryValue(userIds, "Array(String)")})`
    : "";

  // Calculate Property Types to Scan
  const propertyTypes: string[] = [];
  if (
    (segmentFilter && segmentFilter.length > 0) ||
    (subscriptionGroupFilter && subscriptionGroupFilter.length > 0)
  ) {
    propertyTypes.push("'segment'");
  }

  // We scan user_properties if requested explicitly, OR if we injected the ID anchor
  if ((userPropertyFilter && userPropertyFilter.length > 0) || addedIdAnchor) {
    propertyTypes.push("'user_property'");
  }

  const typeClause =
    propertyTypes.length > 0 ? `AND type IN (${propertyTypes.join(", ")})` : "";

  // Filter the inner query to only scan rows relevant to the requested filters.
  // This allows ClickHouse to skip massive amounts of data blocks.
  const computedPropertyIdsClause =
    computedPropertyIds.length > 0
      ? `AND computed_property_id IN (${qb.addQueryValue(
          computedPropertyIds,
          "Array(String)",
        )})`
      : "";

  const workspaceIdClause =
    childWorkspaceIds.length > 0
      ? `workspace_id IN (${qb.addQueryValue(childWorkspaceIds, "Array(String)")})`
      : `workspace_id = ${qb.addQueryValue(workspaceId, "String")}`;

  // Using a similar nested query approach as getUsers
  const query = `
    SELECT
      uniqExact(user_id) as user_count
    FROM (
      SELECT
        ${selectUserIdStr}
      FROM computed_property_assignments_v2
      WHERE
        ${workspaceIdClause}
        ${userIdsClause}
        ${typeClause}
        ${computedPropertyIdsClause}
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
  const userCount = rows.length > 0 ? Number(rows[0]?.user_count ?? 0) : 0;

  return ok({
    userCount,
  });
}
