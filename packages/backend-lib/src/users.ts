import { Sql } from "@prisma/client/runtime/library";
import { Static, Type } from "@sinclair/typebox";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";
import { validate as validateUuid } from "uuid";

import logger from "./logger";
import prisma from "./prisma";
import {
  CursorDirectionEnum,
  GetUsersRequest,
  GetUsersResponse,
  GetUsersResponseItem,
  Prisma,
} from "./types";

const UsersQueryItem = Type.Object({
  type: Type.Union([Type.Literal(0), Type.Literal(1)]),
  userId: Type.String(),
  computedPropertyKey: Type.String(),
  segmentValue: Type.Boolean(),
  userPropertyValue: Type.String(),
});

const UsersQueryResult = Type.Array(UsersQueryItem);

enum CursorKey {
  UserIdKey = "u",
}

const Cursor = Type.Object({
  [CursorKey.UserIdKey]: Type.String(),
});

type Cursor = Static<typeof Cursor>;

function serializeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64");
}

function buildUserIdQueries({
  workspaceId,
  direction,
  segmentId,
  userIds,
  cursor,
}: {
  workspaceId: string;
  segmentId?: string;
  cursor: Cursor | null;
  direction: CursorDirectionEnum;
  userIds?: string[];
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
    userIdsCondition = Prisma.sql`"userId" IN (${Prisma.join(
      userIds.map((id) => `CAST(${id} AS UUID)`)
    )})`;
  } else {
    userIdsCondition = Prisma.sql`1=1`;
  }

  const segmentIdCondition = segmentId
    ? Prisma.sql`"segmentId" = CAST(${segmentId} AS UUID)`
    : Prisma.sql`1=1`;

  const userPropertyAssignmentCondition = segmentId
    ? Prisma.sql`1=0`
    : Prisma.sql`1=1`;

  const userIdQueries = Prisma.sql`
    SELECT "userId"
    FROM "UserPropertyAssignment"
    WHERE "workspaceId" = CAST(${workspaceId} AS UUID)
      AND ${lastUserIdCondition}
      AND "value" != ''
      AND ${userPropertyAssignmentCondition}
      AND ${userIdsCondition}

    UNION ALL

    SELECT "userId"
    FROM "SegmentAssignment"
    WHERE "workspaceId" = CAST(${workspaceId} AS UUID)
      AND ${lastUserIdCondition}
      AND "inSegment" = TRUE
      AND ${segmentIdCondition}
      AND ${userIdsCondition}
  `;

  return userIdQueries;
}

export async function getUsers({
  workspaceId,
  cursor: unparsedCursor,
  segmentId,
  direction = CursorDirectionEnum.After,
  userIds,
  limit = 10,
}: GetUsersRequest & { workspaceId: string }): Promise<
  Result<GetUsersResponse, Error>
> {
  if (segmentId && !validateUuid(segmentId)) {
    return err(new Error("segmentId is invalid uuid"));
  }
  let cursor: Cursor | null = null;
  if (unparsedCursor) {
    try {
      const asciiString = Buffer.from(unparsedCursor, "base64").toString(
        "ascii"
      );
      const decoded = JSON.parse(asciiString);
      cursor = unwrap(schemaValidate(decoded, Cursor));
    } catch (e) {
      logger().error(
        {
          err: e,
        },
        "failed to decode user cursor"
      );
    }
  }

  const userIdQueries = buildUserIdQueries({
    workspaceId,
    userIds,
    cursor,
    segmentId,
    direction,
  });

  const query = Prisma.sql`
      WITH unique_user_ids AS (
          SELECT DISTINCT "userId"
          FROM (${userIdQueries}) AS all_user_ids
          ORDER BY "userId"
          LIMIT ${limit}
      )

      SELECT *
      FROM (
          SELECT
              1 AS type,
              "userId",
              up.name AS "computedPropertyKey",
              FALSE AS "segmentValue",
              value AS "userPropertyValue"
          FROM "UserPropertyAssignment" as upa
          JOIN "UserProperty" AS up ON up.id = "userPropertyId"
          WHERE
              upa."workspaceId" = CAST(${workspaceId} AS UUID)
              AND "userId" IN (SELECT "userId" FROM unique_user_ids)
              AND "value" != ''
              AND "value" != '""'

          UNION ALL

          SELECT
              0 AS type,
              "userId",
              CAST("segmentId" AS TEXT) AS "computedPropertyKey",
              "inSegment" AS "segmentValue",
              '' AS "userPropertyValue"
          FROM "SegmentAssignment"
          WHERE
              "workspaceId" = CAST(${workspaceId} AS UUID)
              AND "userId" IN (SELECT "userId" FROM unique_user_ids)
              AND "inSegment" = TRUE
      ) AS combined_results
      ORDER BY "userId" ASC;
    `;

  const results = await prisma().$queryRaw(query);

  const userMap = new Map<string, GetUsersResponseItem>();
  const parsedResult = unwrap(schemaValidate(results, UsersQueryResult));

  for (const result of parsedResult) {
    const user: GetUsersResponseItem = userMap.get(result.userId) ?? {
      id: result.userId,
      segments: [],
      properties: {},
    };
    if (result.type === 0) {
      user.segments.push(result.computedPropertyKey);
    } else {
      let value: string;
      try {
        value = JSON.parse(result.userPropertyValue);
      } catch (e) {
        value = result.userPropertyValue;
      }
      user.properties[result.computedPropertyKey] = value;
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
    val.nextCursor = serializeCursor(nextCursor);
  }
  if (previousCursor) {
    val.previousCursor = serializeCursor(previousCursor);
  }

  return ok(val);
}
