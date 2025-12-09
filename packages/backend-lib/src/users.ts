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
  userPropertyIndex as dbUserPropertyIndex,
  workspace as dbWorkspace,
} from "./db/schema";
import logger from "./logger";
import { withSpan } from "./openTelemetry";
import { deserializeCursor, serializeCursor } from "./pagination";
import {
  getSubscriptionGroupDetails,
  getSubscriptionGroupsWithAssignments,
  inSubscriptionGroup,
} from "./subscriptionGroups";
import {
  CursorDirectionEnum,
  DBResourceTypeEnum,
  DeleteUsersRequest,
  GetUsersCountResponse,
  GetUsersRequest,
  GetUsersResponse,
  GetUsersResponseItem,
  Segment,
  SortOrderEnum,
  SubscriptionGroupType,
  UserProperty,
  UserPropertyDefinition,
  UserSubscriptionItem,
} from "./types";
import { UserPropertyIndexType } from "./userPropertyIndices";

enum CursorKey {
  UserIdKey = "u",
  PhaseKey = "p",
  ValueKey = "v",
}

const Cursor = Type.Object({
  [CursorKey.UserIdKey]: Type.String(),
  [CursorKey.PhaseKey]: Type.Optional(
    Type.Union([Type.Literal("indexed"), Type.Literal("remainder")]),
  ),
  [CursorKey.ValueKey]: Type.Optional(
    Type.Union([Type.String(), Type.Number(), Type.Null()]),
  ),
});

type Cursor = Static<typeof Cursor>;

function serializeUserCursor(cursor: Cursor): string {
  return serializeCursor(cursor);
}

export async function buildGetUsersQueriesForDebug(
  request: GetUsersRequest,
): Promise<string[]> {
  const queries: string[] = [];
  const {
    workspaceId,
    cursor: unparsedCursor,
    segmentFilter,
    userIds,
    userPropertyFilter,
    direction = CursorDirectionEnum.After,
    limit = 10,
    subscriptionGroupFilter,
    sortBy,
  } = request;

  const childWorkspaceIds = (
    await db()
      .select({ id: dbWorkspace.id })
      .from(dbWorkspace)
      .where(eq(dbWorkspace.parentWorkspaceId, workspaceId))
  ).map((o) => o.id);

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

  let subscriptionGroups = new Map<
    string,
    {
      type: SubscriptionGroupType;
      segmentId: string;
    }
  >();
  if (subscriptionGroupFilter?.length) {
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
    subscriptionGroups = subscriptionGroupsRows.reduce(
      (acc, subscriptionGroup) => {
        const subscriptionGroupType =
          subscriptionGroup.type === SubscriptionGroupType.OptOut
            ? SubscriptionGroupType.OptOut
            : SubscriptionGroupType.OptIn;
        acc.set(subscriptionGroup.id, {
          type: subscriptionGroupType,
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
  }

  const buildWorkspaceIdClause = (qb: ClickHouseQueryBuilder) =>
    childWorkspaceIds.length > 0
      ? `workspace_id IN (${qb.addQueryValue(childWorkspaceIds, "Array(String)")})`
      : `workspace_id = ${qb.addQueryValue(workspaceId, "String")}`;

  const buildFilterClausesDebug = async (qb: ClickHouseQueryBuilder) => {
    const computedPropertyIds = [
      ...(userPropertyFilter?.map((property) => property.id) ?? []),
      ...(segmentFilter ?? []),
    ];
    const selectUserIdColumns = ["user_id"];
    const havingSubClauses: string[] = [];

    // Flag to track if we have a strict "Anchor" filter already.
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

    const subscriptionGroupsFilter = subscriptionGroupFilter ?? [];
    for (const subscriptionGroup of subscriptionGroupsFilter) {
      const sg = subscriptionGroups.get(subscriptionGroup);
      if (!sg) {
        continue;
      }
      const { type, segmentId } = sg;

      computedPropertyIds.push(segmentId);

      const varName = qb.getVariableName();
      selectUserIdColumns.push(
        `argMax(if(computed_property_id = ${qb.addQueryValue(segmentId, "String")}, segment_value, null), assigned_at) as ${varName}`,
      );
      if (type === SubscriptionGroupType.OptOut) {
        havingSubClauses.push(`(${varName} == True OR ${varName} IS NULL)`);
      } else {
        havingSubClauses.push(`${varName} == True`);
        hasStrictFilter = true;
      }
    }

    // [OPTIMIZATION] Implicit Anchor
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
    const userIdsClause = userIds
      ? `AND user_id IN (${qb.addQueryValue(userIds, "Array(String)")})`
      : "";
    const workspaceIdClause = buildWorkspaceIdClause(qb);

    // Calculate Property Types to Scan
    const propertyTypes: string[] = [];
    if (
      (segmentFilter && segmentFilter.length > 0) ||
      (subscriptionGroupFilter && subscriptionGroupFilter.length > 0)
    ) {
      propertyTypes.push("'segment'");
    }
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

    const computedPropertyIdsClause =
      computedPropertyIds.length > 0
        ? `AND computed_property_id IN (${qb.addQueryValue(
            computedPropertyIds,
            "Array(String)",
          )})`
        : "";

    return {
      selectUserIdColumns,
      havingClause,
      userIdsClause,
      workspaceIdClause,
      typeClause,
      computedPropertyIdsClause,
    };
  };

  const shouldDefaultSort = !sortBy || sortBy === "id" || sortBy === "user_id";

  const sortIndexRecord = shouldDefaultSort
    ? null
    : await db().query.userPropertyIndex.findFirst({
        where: and(
          eq(dbUserPropertyIndex.workspaceId, workspaceId),
          eq(dbUserPropertyIndex.userPropertyId, sortBy),
        ),
      });

  if (shouldDefaultSort || !sortIndexRecord) {
    const qb = new ClickHouseQueryBuilder({ debug: true });
    const {
      selectUserIdColumns,
      havingClause,
      userIdsClause,
      workspaceIdClause,
      typeClause,
      computedPropertyIdsClause,
    } = await buildFilterClausesDebug(qb);

    const cursorClause = cursor
      ? `and user_id ${
          direction === CursorDirectionEnum.After ? ">" : "<="
        } ${qb.addQueryValue(cursor[CursorKey.UserIdKey], "String")}`
      : "";

    const selectedStr = selectUserIdColumns.join(", ");

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
              user_id ${
                direction === CursorDirectionEnum.After ? "ASC" : "DESC"
              }
            LIMIT ${limit}
          ))
        GROUP BY cp.user_id, cp.computed_property_id, cp.type
      ) as assignments
      GROUP BY assignments.user_id
      ORDER BY
        assignments.user_id ASC
    `;
    queries.push(query.trim());
    return queries;
  }

  let indexType: UserPropertyIndexType;
  if (sortIndexRecord.type === "Number") {
    indexType = "Number";
  } else if (sortIndexRecord.type === "String") {
    indexType = "String";
  } else {
    indexType = "Date";
  }
  const sortPropertyId = sortIndexRecord.userPropertyId;
  let indexTable: string;
  let valueColumn: string;

  switch (indexType) {
    case "Number":
      indexTable = "user_property_idx_num";
      valueColumn = "value_num";
      break;
    case "String":
      indexTable = "user_property_idx_str";
      valueColumn = "value_str";
      break;
    default:
      indexTable = "user_property_idx_date";
      valueColumn = "value_date";
      break;
  }

  const qbIndex = new ClickHouseQueryBuilder({ debug: true });
  const {
    selectUserIdColumns,
    havingClause,
    userIdsClause,
    workspaceIdClause,
    typeClause: idxTypeClause,
    computedPropertyIdsClause: idxComputedPropertyIdsClause,
  } = await buildFilterClausesDebug(qbIndex);
  const workspaceIdClauseWithAlias = workspaceIdClause.replace(
    /workspace_id/g,
    "idx.workspace_id",
  );

  const filteredSubquery = `
    SELECT user_id FROM (
      SELECT
        ${selectUserIdColumns.join(", ")}
      FROM computed_property_assignments_v2
      WHERE
        ${workspaceIdClause}
        ${userIdsClause}
        ${idxTypeClause}
        ${idxComputedPropertyIdsClause}
      GROUP BY workspace_id, user_id
      ${havingClause}
    )
  `;

  const sortPropertyParam = qbIndex.addQueryValue(sortPropertyId, "String");
  const orderDirection =
    direction === CursorDirectionEnum.After ? "ASC" : "DESC";
  let indexCursorClause = "";
  if (cursor) {
    const cursorUserIdParam = qbIndex.addQueryValue(
      cursor[CursorKey.UserIdKey],
      "String",
    );
    const cursorValue = cursor[CursorKey.ValueKey];
    if (cursorValue !== undefined) {
      let valueDataType: "Float64" | "String" | "DateTime64(3)";
      if (indexType === "Number") {
        valueDataType = "Float64";
      } else if (indexType === "String") {
        valueDataType = "String";
      } else {
        valueDataType = "DateTime64(3)";
      }
      const cursorValueParam = qbIndex.addQueryValue(
        cursorValue,
        valueDataType,
      );
      indexCursorClause = `AND (${valueColumn}, user_id) ${
        direction === CursorDirectionEnum.After ? ">" : "<="
      } (${cursorValueParam}, ${cursorUserIdParam})`;
    } else {
      indexCursorClause = `AND user_id ${
        direction === CursorDirectionEnum.After ? ">" : "<="
      } ${cursorUserIdParam}`;
    }
  }

  const indexQuery = `
    SELECT
      idx.user_id,
      idx.${valueColumn} AS sort_value
    FROM ${indexTable} AS idx
    INNER JOIN (${filteredSubquery}) AS filtered USING (user_id)
    WHERE
      ${workspaceIdClauseWithAlias}
      AND idx.computed_property_id = ${sortPropertyParam}
      ${indexCursorClause}
    ORDER BY idx.${valueColumn} ${orderDirection}, idx.user_id ${orderDirection}
    LIMIT ${limit}
  `;
  queries.push(indexQuery.trim());

  const qbRemainder = new ClickHouseQueryBuilder({ debug: true });
  const {
    selectUserIdColumns: remSelectUserIdColumns,
    havingClause: remHavingClause,
    userIdsClause: remUserIdsClause,
    workspaceIdClause: remWorkspaceIdClause,
    typeClause: remTypeClause,
    computedPropertyIdsClause: remComputedPropertyIdsClause,
  } = await buildFilterClausesDebug(qbRemainder);
  const cursorClause =
    cursor?.[CursorKey.PhaseKey] === "remainder"
      ? `AND user_id ${
          direction === CursorDirectionEnum.After ? ">" : "<="
        } ${qbRemainder.addQueryValue(cursor[CursorKey.UserIdKey], "String")}`
      : "";
  const sortPropertyParamRemainder = qbRemainder.addQueryValue(
    sortPropertyId,
    "String",
  );
  const indexedUsersSubquery = `
    SELECT user_id FROM ${indexTable}
    WHERE
      ${remWorkspaceIdClause}
      AND computed_property_id = ${sortPropertyParamRemainder}
  `;
  const orderDirectionRemainder =
    direction === CursorDirectionEnum.After ? "ASC" : "DESC";
  const remainderQuery = `
    SELECT
      ${remSelectUserIdColumns.join(", ")}
    FROM computed_property_assignments_v2
    WHERE
      ${remWorkspaceIdClause}
      ${remUserIdsClause}
      ${cursorClause}
      ${remTypeClause}
      ${remComputedPropertyIdsClause}
      AND user_id NOT IN (${indexedUsersSubquery})
    GROUP BY workspace_id, user_id
    ${remHavingClause}
    ORDER BY user_id ${orderDirectionRemainder}
    LIMIT ${limit}
  `;
  queries.push(remainderQuery.trim());

  return queries;
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
    includeSubscriptions,
    sortBy,
    sortOrder = SortOrderEnum.Asc,
    exclusiveCursor = false,
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
    if (sortBy) {
      span.setAttribute("sortBy", sortBy);
    }
    span.setAttribute("sortOrder", sortOrder);

    // Determine the actual ORDER BY direction based on sortOrder and pagination direction
    // sortOrder controls the primary sort direction (asc/desc)
    // direction controls whether we're going forward (After) or backward (Before) through pages
    const baseSortAsc = sortOrder === SortOrderEnum.Asc;
    // When paginating "Before", we temporarily reverse the sort to get the correct page, then reverse results
    const effectiveSortAsc =
      direction === CursorDirectionEnum.Before ? !baseSortAsc : baseSortAsc;
    const orderDirection = effectiveSortAsc ? "ASC" : "DESC";
    // Cursor comparison:
    // - After direction: always use strict comparison (> or <) to exclude cursor position
    // - Before direction: use inclusive comparison (<= or >=) by default, or strict if exclusiveCursor is true
    // exclusiveCursor=true gives correct back-navigation (previous page doesn't include current page's first item)
    let cursorComparison: string;
    const useStrictComparison =
      direction === CursorDirectionEnum.After || exclusiveCursor;
    if (effectiveSortAsc) {
      cursorComparison = useStrictComparison ? ">" : ">=";
    } else {
      cursorComparison = useStrictComparison ? "<" : "<=";
    }

    const childWorkspaceIds = (
      await db()
        .select({ id: dbWorkspace.id })
        .from(dbWorkspace)
        .where(eq(dbWorkspace.parentWorkspaceId, workspaceId))
    ).map((o) => o.id);

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

    let subscriptionGroups = new Map<
      string,
      {
        type: SubscriptionGroupType;
        segmentId: string;
      }
    >();
    if (subscriptionGroupFilter?.length) {
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
      subscriptionGroups = subscriptionGroupsRows.reduce(
        (acc, subscriptionGroup) => {
          const subscriptionGroupType =
            subscriptionGroup.type === SubscriptionGroupType.OptOut
              ? SubscriptionGroupType.OptOut
              : SubscriptionGroupType.OptIn;
          acc.set(subscriptionGroup.id, {
            type: subscriptionGroupType,
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
    }

    const buildWorkspaceIdClause = (qb: ClickHouseQueryBuilder) =>
      childWorkspaceIds.length > 0
        ? `workspace_id IN (${qb.addQueryValue(childWorkspaceIds, "Array(String)")})`
        : `workspace_id = ${qb.addQueryValue(workspaceId, "String")}`;

    const buildFilterClauses = async (qb: ClickHouseQueryBuilder) => {
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

      const subscriptionGroupsFilter = subscriptionGroupFilter ?? [];
      for (const subscriptionGroup of subscriptionGroupsFilter) {
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
        const { type, segmentId } = sg;

        computedPropertyIds.push(segmentId);

        const varName = qb.getVariableName();
        selectUserIdColumns.push(
          `argMax(if(computed_property_id = ${qb.addQueryValue(segmentId, "String")}, segment_value, null), assigned_at) as ${varName}`,
        );
        if (type === SubscriptionGroupType.OptOut) {
          havingSubClauses.push(`(${varName} == True OR ${varName} IS NULL)`);
        } else {
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
      const userIdsClause = userIds
        ? `AND user_id IN (${qb.addQueryValue(userIds, "Array(String)")})`
        : "";
      const workspaceIdClause = buildWorkspaceIdClause(qb);

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

      return {
        selectUserIdColumns,
        havingClause,
        userIdsClause,
        workspaceIdClause,
        typeClause,
        computedPropertyIdsClause,
      };
    };

    interface UserRow {
      user_id: string;
      segments: [string, string][];
      user_properties: [string, string][];
    }

    const fetchUserRowsByIds = async (
      userIdsForQuery: string[],
    ): Promise<UserRow[]> => {
      if (userIdsForQuery.length === 0) {
        return [];
      }
      const qb = new ClickHouseQueryBuilder();
      const workspaceIdClause = buildWorkspaceIdClause(qb);
      const userIdsParam = qb.addQueryValue(userIdsForQuery, "Array(String)");
      const userQuery = `
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
          AND cp.user_id IN (${userIdsParam})
        GROUP BY cp.user_id, cp.computed_property_id, cp.type
      ) as assignments
      GROUP BY assignments.user_id
      ORDER BY assignments.user_id ASC
    `;

      const results = await chQuery({
        query: userQuery,
        query_params: qb.getQueries(),
        clickhouse_settings: {
          output_format_json_named_tuples_as_objects: 0,
        },
      });
      const rows = await results.json<UserRow>();
      return rows;
    };

    const shouldDefaultSort =
      !sortBy || sortBy === "id" || sortBy === "user_id";

    let rows: UserRow[] = [];
    let orderedUserIds: string[] = [];
    // Tracks the ordered user IDs and phase/value that drive cursor generation.
    let paginatedEntries: {
      userId: string;
      phase?: "indexed" | "remainder";
      value?: string | number | null;
    }[] = [];

    const sortIndexRecord = shouldDefaultSort
      ? null
      : await db().query.userPropertyIndex.findFirst({
          where: and(
            eq(dbUserPropertyIndex.workspaceId, workspaceId),
            eq(dbUserPropertyIndex.userPropertyId, sortBy),
          ),
        });

    if (shouldDefaultSort || !sortIndexRecord) {
      const qb = new ClickHouseQueryBuilder();
      const {
        selectUserIdColumns,
        havingClause,
        userIdsClause,
        workspaceIdClause,
        typeClause,
        computedPropertyIdsClause,
      } = await buildFilterClauses(qb);

      const cursorClause = cursor
        ? `and user_id ${cursorComparison} ${qb.addQueryValue(cursor[CursorKey.UserIdKey], "String")}`
        : "";

      const selectedStr = selectUserIdColumns.join(", ");

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
            ORDER BY user_id ${orderDirection}
            LIMIT ${limit}
          ))
        GROUP BY cp.user_id, cp.computed_property_id, cp.type
      ) as assignments
      GROUP BY assignments.user_id
      ORDER BY assignments.user_id ${orderDirection}
    `;
      const results = await chQuery({
        query,
        query_params: qb.getQueries(),
        clickhouse_settings: {
          output_format_json_named_tuples_as_objects: 0,
        },
      });
      rows = await results.json<UserRow>();
      orderedUserIds = rows.map((row) => row.user_id);
      paginatedEntries = orderedUserIds.map((id) => ({ userId: id }));
    } else {
      // Indexed sort path: page through the index table first, then backfill remaining slots from non-indexed users.
      let indexType: UserPropertyIndexType;
      if (sortIndexRecord.type === "Number") {
        indexType = "Number";
      } else if (sortIndexRecord.type === "String") {
        indexType = "String";
      } else {
        indexType = "Date";
      }
      const sortPropertyId = sortIndexRecord.userPropertyId;
      let indexTable: string;
      let valueColumn: string;
      let valueDataType: "Float64" | "String" | "DateTime64(3)";

      switch (indexType) {
        case "Number":
          indexTable = "user_property_idx_num";
          valueColumn = "value_num";
          valueDataType = "Float64";
          break;
        case "String":
          indexTable = "user_property_idx_str";
          valueColumn = "value_str";
          valueDataType = "String";
          break;
        default:
          indexTable = "user_property_idx_date";
          valueColumn = "value_date";
          valueDataType = "DateTime64(3)";
          break;
      }
      const shouldQueryIndex = cursor?.[CursorKey.PhaseKey] !== "remainder";

      if (shouldQueryIndex) {
        const qbIndex = new ClickHouseQueryBuilder();
        const {
          selectUserIdColumns,
          havingClause,
          userIdsClause,
          workspaceIdClause,
          typeClause,
          computedPropertyIdsClause,
        } = await buildFilterClauses(qbIndex);
        const workspaceIdClauseWithAlias = workspaceIdClause.replace(
          /workspace_id/g,
          "idx.workspace_id",
        );

        const filteredSubquery = `
        SELECT user_id FROM (
          SELECT
            ${selectUserIdColumns.join(", ")}
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

        const sortPropertyParam = qbIndex.addQueryValue(
          sortPropertyId,
          "String",
        );
        let indexCursorClause = "";
        if (cursor) {
          const cursorUserIdParam = qbIndex.addQueryValue(
            cursor[CursorKey.UserIdKey],
            "String",
          );
          const cursorValue = cursor[CursorKey.ValueKey];
          if (cursorValue !== undefined) {
            const cursorValueParam = qbIndex.addQueryValue(
              cursorValue,
              valueDataType,
            );
            indexCursorClause = `AND (${valueColumn}, user_id) ${cursorComparison} (${cursorValueParam}, ${cursorUserIdParam})`;
          } else {
            indexCursorClause = `AND user_id ${cursorComparison} ${cursorUserIdParam}`;
          }
        }

        const indexQuery = `
        SELECT
          idx.user_id,
          idx.${valueColumn} AS sort_value
        FROM ${indexTable} AS idx
        INNER JOIN (${filteredSubquery}) AS filtered USING (user_id)
        WHERE
          ${workspaceIdClauseWithAlias}
          AND idx.computed_property_id = ${sortPropertyParam}
          ${indexCursorClause}
        ORDER BY idx.${valueColumn} ${orderDirection}, idx.user_id ${orderDirection}
        LIMIT ${limit}
      `;

        const indexResults = await chQuery({
          query: indexQuery,
          query_params: qbIndex.getQueries(),
        });
        const indexRows = await indexResults.json<{
          user_id: string;
          sort_value: string | number | null;
        }>();
        const indexEntries = indexRows.map((row) => ({
          userId: row.user_id,
          value: row.sort_value,
          phase: "indexed" as const,
        }));
        paginatedEntries = indexEntries;
      }

      // If the index page did not fill the requested limit, fetch the remainder sorted by user_id.
      const remainingLimit = limit - paginatedEntries.length;
      if (remainingLimit > 0) {
        const qbRemainder = new ClickHouseQueryBuilder();
        const {
          selectUserIdColumns,
          havingClause,
          userIdsClause,
          workspaceIdClause,
          typeClause: remTypeClause,
          computedPropertyIdsClause: remComputedPropertyIdsClause,
        } = await buildFilterClauses(qbRemainder);
        const remainderCursorClause =
          cursor?.[CursorKey.PhaseKey] === "remainder"
            ? `AND user_id ${cursorComparison} ${qbRemainder.addQueryValue(cursor[CursorKey.UserIdKey], "String")}`
            : "";
        const sortPropertyParam = qbRemainder.addQueryValue(
          sortPropertyId,
          "String",
        );
        const indexedUsersSubquery = `
        SELECT user_id FROM ${indexTable}
        WHERE
          ${workspaceIdClause}
          AND computed_property_id = ${sortPropertyParam}
      `;
        const remainderQuery = `
        SELECT
          ${selectUserIdColumns.join(", ")}
        FROM computed_property_assignments_v2
        WHERE
          ${workspaceIdClause}
          ${userIdsClause}
          ${remainderCursorClause}
          ${remTypeClause}
          ${remComputedPropertyIdsClause}
          AND user_id NOT IN (${indexedUsersSubquery})
        GROUP BY workspace_id, user_id
        ${havingClause}
        ORDER BY user_id ${orderDirection}
        LIMIT ${remainingLimit}
      `;

        const remainderResults = await chQuery({
          query: remainderQuery,
          query_params: qbRemainder.getQueries(),
        });
        const remainderRows = await remainderResults.json<{
          user_id: string;
        }>();
        const remainderEntries = remainderRows.map((row) => ({
          userId: row.user_id,
          phase: "remainder" as const,
        }));
        paginatedEntries = [...paginatedEntries, ...remainderEntries];
      }

      orderedUserIds = paginatedEntries.map((entry) => entry.userId);
      rows = await fetchUserRowsByIds(orderedUserIds);
    }

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
    const [userProperties, segments] = await Promise.all([
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

    logger().debug(
      {
        rows,
      },
      "get users rows",
    );
    const rowById = new Map(rows.map((row) => [row.user_id, row]));
    // Preserve the order from paginatedEntries so index/remainder interleaving is reflected in the final payload.
    let orderedRows =
      orderedUserIds.length > 0
        ? orderedUserIds
            .map((id) => rowById.get(id))
            .filter((row): row is (typeof rows)[number] => !!row)
        : rows;

    // When paginating "Before", we query in reverse order, so reverse the results to present in correct order
    if (direction === CursorDirectionEnum.Before) {
      orderedRows = [...orderedRows].reverse();
      paginatedEntries = [...paginatedEntries].reverse();
    }
    const users: GetUsersResponseItem[] = orderedRows.map((row) => {
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

    // Fetch subscriptions if requested
    if (includeSubscriptions && users.length > 0) {
      const userIdsForSubscriptions = users.map((u) => u.id);
      const subscriptionGroupsWithAssignments =
        await getSubscriptionGroupsWithAssignments({
          workspaceId,
          userIds: userIdsForSubscriptions,
        });

      // Group subscriptions by userId
      const subscriptionsByUserId = new Map<string, UserSubscriptionItem[]>();
      for (const sg of subscriptionGroupsWithAssignments) {
        const details = getSubscriptionGroupDetails(sg);
        const subscribed = inSubscriptionGroup(details);
        const subscriptionItem: UserSubscriptionItem = {
          id: sg.id,
          name: sg.name,
          subscribed,
        };

        const existing = subscriptionsByUserId.get(sg.userId) ?? [];
        existing.push(subscriptionItem);
        subscriptionsByUserId.set(sg.userId, existing);
      }

      // Attach subscriptions to each user
      for (const user of users) {
        user.subscriptions = subscriptionsByUserId.get(user.id) ?? [];
      }
    }

    span.setAttribute("usersCount", users.length);

    const lastEntry = paginatedEntries[paginatedEntries.length - 1];
    const firstEntry = paginatedEntries[0];

    let nextCursor: Cursor | null;
    let previousCursor: Cursor | null;

    if (lastEntry && paginatedEntries.length >= limit) {
      nextCursor = {
        [CursorKey.UserIdKey]: lastEntry.userId,
        ...(lastEntry.phase && { [CursorKey.PhaseKey]: lastEntry.phase }),
        ...(lastEntry.phase === "indexed" && {
          [CursorKey.ValueKey]: lastEntry.value ?? null,
        }),
      };
    } else {
      nextCursor = null;
    }

    if (firstEntry && cursor) {
      previousCursor = {
        [CursorKey.UserIdKey]: firstEntry.userId,
        ...(firstEntry.phase && { [CursorKey.PhaseKey]: firstEntry.phase }),
        ...(firstEntry.phase === "indexed" && {
          [CursorKey.ValueKey]: firstEntry.value ?? null,
        }),
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
        const subscriptionGroupType =
          subscriptionGroup.type === SubscriptionGroupType.OptOut
            ? SubscriptionGroupType.OptOut
            : SubscriptionGroupType.OptIn;
        const entry: {
          type: SubscriptionGroupType;
          segmentId: string;
        } = {
          type: subscriptionGroupType,
          segmentId: subscriptionGroup.segmentId,
        };
        acc.set(subscriptionGroup.id, entry);
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

    for (const subscriptionGroup of subscriptionGroupFilter) {
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
      const { type, segmentId } = sg;
      const varName = qb.getVariableName();
      computedPropertyIds.push(segmentId);
      selectUserIdColumns.push(
        `argMax(if(computed_property_id = ${qb.addQueryValue(segmentId, "String")}, segment_value, null), assigned_at) as ${varName}`,
      );
      if (type === SubscriptionGroupType.OptOut) {
        havingSubClauses.push(`(${varName} == True OR ${varName} IS NULL)`);
      } else {
        havingSubClauses.push(`${varName} == True`);
        hasStrictFilter = true;
      }
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
