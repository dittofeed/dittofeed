import { Type } from "@sinclair/typebox";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";

import logger from "./logger";
import prisma from "./prisma";
import {
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

const Cursor = Type.Object({
  lastUserId: Type.String(),
});

export async function getUsers({
  workspaceId,
  afterCursor,
  limit = 10,
}: GetUsersRequest & { workspaceId: string }): Promise<GetUsersResponse> {
  let lastUserId: string | null = null;
  if (afterCursor) {
    try {
      const asciiString = Buffer.from(afterCursor, "base64").toString("ascii");
      const decoded = JSON.parse(asciiString);
      const cursor = unwrap(schemaValidate(decoded, Cursor));
      lastUserId = cursor.lastUserId;
    } catch (e) {
      logger().error(
        {
          err: e,
        },
        "failed to decode user cursor"
      );
    }
  }
  const lastUserIdCondition = lastUserId
    ? Prisma.sql`"userId" > ${lastUserId}`
    : Prisma.sql`1=1`;

  const results = await prisma().$queryRaw(
    Prisma.sql`
      WITH unique_user_ids AS (
          SELECT DISTINCT "userId"
          FROM (
              SELECT "userId" FROM "UserPropertyAssignment" WHERE "workspaceId" = CAST(${workspaceId} AS UUID) AND ${lastUserIdCondition}
              UNION
              SELECT "userId" FROM "SegmentAssignment" WHERE "workspaceId" = CAST(${workspaceId} AS UUID) AND ${lastUserIdCondition}
          ) AS all_user_ids
          LIMIT ${limit}
      )
      SELECT * FROM (
        SELECT 1 AS type, "userId", up.name AS "computedPropertyKey", FALSE AS "segmentValue", value AS "userPropertyValue"
        FROM "UserPropertyAssignment" as upa
        JOIN "UserProperty" AS up ON up.id = "userPropertyId"
        WHERE upa."workspaceId" = CAST(${workspaceId} AS UUID) AND "value" != '' AND "userId" IN (SELECT "userId" FROM unique_user_ids)
        UNION ALL
        SELECT 0 AS type, "userId", CAST("segmentId" AS TEXT) AS "computedPropertyKey", "inSegment" AS "segmentValue", '' AS "userPropertyValue"
        FROM "SegmentAssignment"
        WHERE "workspaceId" = CAST(${workspaceId} AS UUID) AND "inSegment" = TRUE AND "userId" IN (SELECT "userId" FROM unique_user_ids)
      ) AS combined_results
      ORDER BY "userId" ASC;
    `
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
      user.segments.push(result.computedPropertyKey);
    } else {
      user.properties[result.computedPropertyKey] = result.userPropertyValue;
    }
    userMap.set(result.userId, user);
  }

  const lastResult = parsedResult[parsedResult.length - 1];
  const nextCursor =
    lastResult && parsedResult.length >= limit
      ? Buffer.from(
          JSON.stringify({
            lastUserId: lastResult.userId,
          })
        ).toString("base64")
      : undefined;

  const val: GetUsersResponse = {
    users: Array.from(userMap.values()),
  };

  if (nextCursor) {
    val.nextCursor = nextCursor;
  }
  return val;
}
