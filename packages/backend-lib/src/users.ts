import logger from "./logger";
import prisma from "./prisma";
import { GetUsersRequest, GetUsersResponse, Prisma } from "./types";

/*


SELECT userId,  FROM UserPropertyAssignment WHERE workspaceId = ${workspaceId}

I have two tables in postgres, `UserPropertyAssignment` and `SegmentAssignment`. They have different structures, but share a `userId` column`.

```
\d "UserPropertyAssignment";

   Column    |  Type   | Collation | Nullable | Default 
-------------+---------+-----------+----------+---------
 userId      | text    |           | not null | 
 segmentId   | text    |           | not null | 
 inSegment   | boolean |           | not null | 
 workspaceId | uuid    |           | not null | 
Indexes:
    "SegmentAssignment_workspaceId_userId_segmentId_key" UNIQUE, btree ("workspaceId", "userId", "segmentId")
Foreign-key constraints:
    "SegmentAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"(id) ON UPDATE CASCADE ON DELETE RESTRICT

---

 \d "SegmentAssignment";

     Column     | Type | Collation | Nullable | Default 
----------------+------+-----------+----------+---------
 userId         | text |           | not null | 
 userPropertyId | uuid |           | not null | 
 value          | text |           | not null | 
 workspaceId    | uuid |           | not null | 
Indexes:
    "UserPropertyAssignment_userId_idx" btree ("userId")
    "UserPropertyAssignment_workspaceId_userPropertyId_userId_key" UNIQUE, btree ("workspaceId", "userPropertyId", "userId")
Foreign-key constraints:
    "UserPropertyAssignment_userPropertyId_fkey" FOREIGN KEY ("userPropertyId") REFERENCES "UserProperty"(id) ON UPDATE CASCADE ON DELETE RESTRICT
    "UserPropertyAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"(id) ON UPDATE CASCADE ON DELETE RESTRICT
```

How can I query these tables, retrieving all `SegmentAssignment` and `UserPropertyAssignment` records, for the first 10 unique `userId`'s, for a fixed workspaceId?
*/

export async function getUsers({
  workspaceId,
  limit,
}: GetUsersRequest): Promise<GetUsersResponse> {
  const result = await prisma().$queryRaw(
    Prisma.sql`
      WITH unique_user_ids AS (
          SELECT DISTINCT userId
          FROM (
              SELECT userId FROM UserPropertyAssignment WHERE workspaceId = ${workspaceId}
              UNION
              SELECT userId FROM SegmentAssignment WHERE workspaceId = ${workspaceId}
          ) AS all_user_ids
          LIMIT ${limit}
      )
      SELECT 1 AS type, userId, userPropertyId AS computedPropertyId, NULL AS segmentValue, value AS userPropertyValue
      FROM UserPropertyAssignment
      WHERE workspaceId = ${workspaceId} AND userId IN (SELECT userId FROM unique_user_ids)
      UNION ALL
      SELECT 0 as type, userId, segmentId as computedPropertyId, value AS segmentValue, NULL AS userPropertyValue
      FROM SegmentAssignment
      WHERE workspaceId = ${workspaceId} AND userId IN (SELECT userId FROM unique_user_ids);
    `
  );

  logger().debug(result, "get users query result");

  return {
    users: [],
  };
}
