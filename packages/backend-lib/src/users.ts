import { Sql } from "@prisma/client/runtime/library";
import { Static, Type } from "@sinclair/typebox";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { parseUserProperty } from "isomorphic-lib/src/userProperties";
import { ok, Result } from "neverthrow";

import { clickhouseClient, ClickHouseQueryBuilder } from "./clickhouse";
import logger from "./logger";
import { deserializeCursor, serializeCursor } from "./pagination";
import prisma from "./prisma";
import {
  CursorDirectionEnum,
  DeleteUsersRequest,
  GetUsersRequest,
  GetUsersResponse,
  GetUsersResponseItem,
  GetUsersUserPropertyFilter,
  Prisma,
  UserProperty,
  UserPropertyDefinition,
} from "./types";

const UsersQueryItem = Type.Object({
  type: Type.Union([Type.Literal(0), Type.Literal(1)]),
  userId: Type.String(),
  segmentValue: Type.Boolean(),
  userPropertyValue: Type.String(),
  computedPropertyName: Type.String(),
  computedPropertyId: Type.String(),
});

const UsersQueryResult = Type.Array(UsersQueryItem);

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

function getUserPropertyAssignmentConditions(
  userPropertyFilter: GetUsersUserPropertyFilter,
) {
  const fullQuery: Sql[] = [];

  for (const property of userPropertyFilter) {
    fullQuery.push(
      Prisma.sql`("userPropertyId" = CAST(${property.id} AS UUID) AND "value" ILIKE ANY (ARRAY[${Prisma.join(property.values)}]))`,
    );
  }

  // TODO this isn't right. Should be an AND but have to do a group by first
  return Prisma.join(fullQuery, " OR ");
}

function buildUserIdQueries({
  workspaceId,
  direction,
  segmentFilter,
  userPropertyFilter,
  userIds,
  cursor,
}: {
  workspaceId: string;
  segmentFilter?: string[];
  cursor: Cursor | null;
  direction: CursorDirectionEnum;
  userIds?: string[];
  userPropertyFilter?: GetUsersUserPropertyFilter;
}): Sql {
  let lastUserIdCondition: Sql;
  if (cursor) {
    if (direction === CursorDirectionEnum.Before) {
      lastUserIdCondition = Prisma.sql`"userId" < ${cursor[CursorKey.UserIdKey]}`;
    } else {
      lastUserIdCondition = Prisma.sql`"userId" > ${cursor[CursorKey.UserIdKey]}`;
    }
  } else {
    lastUserIdCondition = Prisma.sql`1=1`;
  }

  let userIdsCondition: Sql;
  if (userIds && userIds.length > 0) {
    userIdsCondition = Prisma.sql`"userId" IN (${Prisma.join(userIds)})`;
  } else {
    userIdsCondition = Prisma.sql`1=1`;
  }

  const segmentIdCondition = segmentFilter
    ? Prisma.sql`("segmentId" IN (${Prisma.join(segmentFilter.map((segmentId) => Prisma.sql`${segmentId}::uuid`))}))`
    : Prisma.sql`1=1`;

  const userPropertyAssignmentCondition = userPropertyFilter
    ? getUserPropertyAssignmentConditions(userPropertyFilter)
    : Prisma.sql`1=1`;

  const userPropertyAssignmentQuery = Prisma.sql`
    SELECT "userId"
    FROM "UserPropertyAssignment"
    WHERE "workspaceId" = CAST(${workspaceId} AS UUID)
      AND ${lastUserIdCondition}
      AND "value" != ''
      AND (${userPropertyAssignmentCondition})
      AND ${userIdsCondition}
  `;
  const segmentAssignmentQuery = Prisma.sql`
    SELECT "userId"
    FROM "SegmentAssignment"
    WHERE "workspaceId" = CAST(${workspaceId} AS UUID)
      AND ${lastUserIdCondition}
      AND "inSegment" = TRUE
      AND ${segmentIdCondition}
      AND ${userIdsCondition}
  `;

  const userIdQueries = [];

  if (userPropertyFilter) {
    userIdQueries.push(userPropertyAssignmentQuery);
  }

  if (segmentFilter) {
    userIdQueries.push(segmentAssignmentQuery);
  }

  if (!userPropertyFilter && !segmentFilter) {
    userIdQueries.push(segmentAssignmentQuery);
    userIdQueries.push(userPropertyAssignmentQuery);
    return Prisma.join(userIdQueries, " UNION ALL ");
  }

  return Prisma.join(userIdQueries, " INTERSECT ");
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

  const userIdQueries = buildUserIdQueries({
    workspaceId,
    userIds,
    cursor,
    userPropertyFilter,
    segmentFilter,
    direction,
  });

  const query = Prisma.sql`
      WITH unique_user_ids AS (
          SELECT DISTINCT "userId"
          FROM (${userIdQueries}) AS all_user_ids
          ORDER BY "userId"
          LIMIT ${limit}
      )

      SELECT
        cr."userId",
        cr."type",
        cr."computedPropertyName",
        cr."computedPropertyId",
        cr."segmentValue",
        cr."userPropertyValue"
      FROM (
          SELECT
              1 AS type,
              "userId",
              up.name AS "computedPropertyName",
              up.id AS "computedPropertyId",
              FALSE AS "segmentValue",
              value AS "userPropertyValue"
          FROM "UserPropertyAssignment" as upa
          JOIN "UserProperty" AS up ON up.id = "userPropertyId"
          WHERE
              upa."workspaceId" = CAST(${workspaceId} AS UUID)
              AND "userId" IN (SELECT "userId" FROM unique_user_ids)
              AND "value" != ''
              AND "value" != '""'
              AND up."resourceType" != 'Internal'

          UNION ALL

          SELECT
              0 AS type,
              "userId",
              s.name AS "computedPropertyName",
              s.id AS "computedPropertyId",
              "inSegment" AS "segmentValue",
              '' AS "userPropertyValue"
          FROM "SegmentAssignment" as sa
          JOIN "Segment" AS s ON s.id = sa."segmentId"
          WHERE
              sa."workspaceId" = CAST(${workspaceId} AS UUID)
              AND "userId" IN (SELECT "userId" FROM unique_user_ids)
              AND s."resourceType" != 'Internal'
              AND "inSegment" = TRUE
      ) AS cr
      ORDER BY "userId" ASC;
    `;

  const countQuery = Prisma.sql`
    SELECT COUNT(DISTINCT "userId") as "userCount"
    FROM (${userIdQueries}) AS all_user_ids
  `;

  const [results, userProperties, countResults] = await Promise.all([
    prisma().$queryRaw(query),
    prisma().userProperty.findMany({
      where: {
        workspaceId,
      },
    }),
    prisma().$queryRaw(countQuery),
  ]);
  const userPropertyMap = userProperties.reduce<Map<string, UserProperty>>(
    (acc, property) => {
      acc.set(property.id, property);
      return acc;
    },
    new Map(),
  );

  const userMap = new Map<string, GetUsersResponseItem>();
  const parsedResult = unwrap(schemaValidate(results, UsersQueryResult));

  for (const result of parsedResult) {
    const user: GetUsersResponseItem = userMap.get(result.userId) ?? {
      id: result.userId,
      segments: [],
      properties: {},
    };
    if (result.type === 0) {
      user.segments.push({
        id: result.computedPropertyId,
        name: result.computedPropertyName,
      });
    } else {
      const userProperty = userPropertyMap.get(result.computedPropertyId);
      if (!userProperty) {
        continue;
      }
      const parsedUp = parseUserProperty(
        userProperty.definition as UserPropertyDefinition,
        result.userPropertyValue,
      );
      if (parsedUp.isErr()) {
        logger().error(
          {
            err: parsedUp.error,
            userPropertyId: userProperty.id,
            userPropertyValue: result.userPropertyValue,
          },
          "failed to parse user property value",
        );
        continue;
      }
      const { value } = parsedUp;

      user.properties[result.computedPropertyId] = {
        name: result.computedPropertyName,
        value,
      };
    }
    userMap.set(result.userId, user);
  }

  const lastResult = parsedResult[parsedResult.length - 1];
  const firstResult = parsedResult[0];

  let nextCursor: Cursor | null;
  let previousCursor: Cursor | null;

  if (lastResult && userMap.size >= limit) {
    nextCursor = {
      [CursorKey.UserIdKey]: lastResult.userId,
    };
  } else {
    nextCursor = null;
  }

  if (firstResult && cursor) {
    previousCursor = {
      [CursorKey.UserIdKey]: firstResult.userId,
    };
  } else {
    previousCursor = null;
  }

  const val: GetUsersResponse = {
    users: Array.from(userMap.values()),
    userCount: Number((countResults as [{ userCount: bigint }])[0].userCount),
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
  // TODO delete intermediate state in ch
  const qb = new ClickHouseQueryBuilder();
  const queries = [
    `
    ALTER TABLE user_events_v2 DELETE WHERE workspace_id = ${qb.addQueryValue(
      workspaceId,
      "String",
    )} AND user_id IN (${qb.addQueryValue(userIds, "Array(String)")});
  `,
  ];

  await Promise.all([
    ...queries.map((query) =>
      clickhouseClient().command({
        query,
        query_params: qb.getQueries(),
        clickhouse_settings: {
          wait_end_of_query: 1,
        },
      }),
    ),
    prisma().userPropertyAssignment.deleteMany({
      where: {
        workspaceId,
        userId: {
          in: userIds,
        },
      },
    }),
    prisma().segmentAssignment.deleteMany({
      where: {
        workspaceId,
        userId: {
          in: userIds,
        },
      },
    }),
  ]);
}
