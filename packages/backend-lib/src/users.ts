import { Sql } from "@prisma/client/runtime/library";
import { Static, Type } from "@sinclair/typebox";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { parseUserProperty } from "isomorphic-lib/src/userProperties";
import { err, ok, Result } from "neverthrow";
import { validate as validateUuid } from "uuid";

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

type UserPropertyIdsFilter = {
    id: string,
    userIds?: string[],
    partial?: string[]
}[]

function getUserPropertyAssignmentConditions(userPropertyIds: UserPropertyIdsFilter) {
    const userIds: string[] = []
    const fullQuery: Sql[] = []

    userPropertyIds.map((property) => {
        console.log({property})

        if (property.userIds) {
            userIds.push(...property.userIds)
        }

        if (property.partial) {
            fullQuery.push(Prisma.sql`("userPropertyId" = CAST(${property.id} AS UUID) AND LOWER("value") LIKE ANY (ARRAY[${Prisma.join(property.partial)}]))`);
        }

    })

    if (userIds.length > 0) {
        fullQuery.unshift(Prisma.sql`"userId" IN (${Prisma.join(userIds)})`)
    }

    return Prisma.join(fullQuery, " OR ")
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
  segmentFilter?: string;
  cursor: Cursor | null;
  direction: CursorDirectionEnum;
  userIds?: string[];
  userPropertyFilter?: UserPropertyIdsFilter;
}): Sql {
  let lastUserIdCondition: Sql;
  if (cursor) {
    if (direction === CursorDirectionEnum.Before) {
      lastUserIdCondition = Prisma.sql`"userId" < ${
        cursor[CursorKey.UserIdKey]
      }`;
    } else {
      lastUserIdCondition = Prisma.sql`"userId" > ${
        cursor[CursorKey.UserIdKey]
      }`;
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

  const segmentIdCondition =segmentFilter 
    ? Prisma.sql`"segmentId" = CAST(${segmentFilter} AS UUID)`
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
      AND ${userPropertyAssignmentCondition}
      AND ${userIdsCondition}
  `
  const segmentAssignmentQuery = Prisma.sql`
    SELECT "userId"
    FROM "SegmentAssignment"
    WHERE "workspaceId" = CAST(${workspaceId} AS UUID)
      AND ${lastUserIdCondition}
      AND "inSegment" = TRUE
      AND ${segmentIdCondition}
      AND ${userIdsCondition}
  `

  const userIdQueries = []

  if (userPropertyFilter) {
      userIdQueries.push(userPropertyAssignmentQuery)
  }

  if (segmentFilter) {
      userIdQueries.push(segmentAssignmentQuery)
  }

  if (!userPropertyFilter && !segmentFilter) {
      userIdQueries.push(segmentAssignmentQuery)
      userIdQueries.push(userPropertyAssignmentQuery)
  }


  return  Prisma.join(userIdQueries, ' UNION ALL ')
}

export async function getUsers({
  workspaceId,
  cursor: unparsedCursor,
  segmentFilter,
  userIds,
  userPropertyFilter,
  direction = CursorDirectionEnum.After,
  limit = 10,
}: GetUsersRequest): Promise<
  Result<GetUsersResponse, Error>
> {
  if (segmentFilter && !validateUuid(segmentFilter)) {
    return err(new Error("segmentId is invalid uuid"));
  }
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

  const [results, userProperties] = await Promise.all([
    prisma().$queryRaw(query),
    prisma().userProperty.findMany({
      where: {
        workspaceId,
      },
    }),
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
  const query = `
    ALTER TABLE user_events_v2 DELETE WHERE workspace_id = ${qb.addQueryValue(
      workspaceId,
      "String",
    )} AND user_id IN (${qb.addQueryValue(userIds, "Array(String)")});
  `;
  await clickhouseClient().command({
    query,
    query_params: qb.getQueries(),
    clickhouse_settings: {
      wait_end_of_query: 1,
    },
  });
  await prisma().userPropertyAssignment.deleteMany({
    where: {
      workspaceId,
      userId: {
        in: userIds,
      },
    },
  });
}
