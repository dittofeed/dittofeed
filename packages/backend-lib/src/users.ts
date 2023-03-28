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

export async function getUsers({
  workspaceId,
  limit,
}: GetUsersRequest & { workspaceId: string }): Promise<GetUsersResponse> {
  const results = await prisma().$queryRaw(
    Prisma.sql`
      WITH unique_user_ids AS (
          SELECT DISTINCT "userId"
          FROM (
              SELECT "userId" FROM "UserPropertyAssignment" WHERE "workspaceId" = CAST(${workspaceId} AS UUID)
              UNION
              SELECT "userId" FROM "SegmentAssignment" WHERE "workspaceId" = CAST(${workspaceId} AS UUID)
          ) AS all_user_ids
          LIMIT ${limit}
      )
      SELECT 1 AS type, "userId", "userPropertyId" AS "computedPropertyId", FALSE AS "segmentValue", value AS "userPropertyValue"
      FROM "UserPropertyAssignment"
      WHERE "workspaceId" = CAST(${workspaceId} AS UUID) AND "value" != '' AND "userId" IN (SELECT "userId" FROM unique_user_ids)
      UNION ALL
      SELECT 0 AS type, "userId", "segmentId" AS "computedPropertyId", "inSegment" AS "segmentValue", '' AS "userPropertyValue"
      FROM "SegmentAssignment"
      WHERE "workspaceId" = CAST(${workspaceId} AS UUID) AND "inSegment" = TRUE AND "userId" IN (SELECT "userId" FROM unique_user_ids);
`
  );

  logger().debug(results, "get users query result");

  const userMap = new Map<string, GetUsersResponseItem>();
  const parsedResult = unwrap(schemaValidate(results, UsersQueryResult));

  for (const result of parsedResult) {
    const user: GetUsersResponseItem = userMap.get(result.userId) ?? {
      id: result.userId,
      segments: {},
      properties: {},
    };
    if (result.type === 0) {
      user.segments[result.computedPropertyId] = result.segmentValue;
    } else {
      user.properties[result.computedPropertyId] = result.userPropertyValue;
    }
    userMap.set(result.userId, user);
  }

  return {
    users: Array.from(userMap.values()),
  };
}
