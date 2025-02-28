import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { submitGroup } from "./apps";
import { ClickHouseQueryBuilder, query as chQuery } from "./clickhouse";
import { getGroupsForUser, getUsersForGroup } from "./groups";
import { createWorkspace } from "./workspaces";

async function getEvents(workspaceId: string) {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const query = `
    SELECT * FROM user_events_v2
    WHERE workspace_id = ${workspaceIdParam}
  `;
  const result = await chQuery({ query, query_params: qb.getQueries() });
  return result.json();
}

async function getGroupUserAssignments(workspaceId: string) {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const query = `
    SELECT * FROM group_user_assignments
    WHERE workspace_id = ${workspaceIdParam}
  `;
  const result = await chQuery({ query, query_params: qb.getQueries() });
  return result.json();
}

describe("groups", () => {
  let workspaceId: string;
  beforeEach(async () => {
    const workspace = unwrap(
      await createWorkspace({
        name: randomUUID(),
      }),
    );
    workspaceId = workspace.id;
  });

  describe("getUsersForGroup", () => {
    describe("when user is assigned to group and then removed from group", () => {
      it("the return value should reflect the addition and removal", async () => {
        const userId = "user-1";
        const userId2 = "user-2";
        const groupId = "group-1";

        await submitGroup({
          workspaceId,
          data: {
            userId,
            groupId,
            messageId: randomUUID(),
          },
        });

        await submitGroup({
          workspaceId,
          data: {
            userId: userId2,
            groupId,
            messageId: randomUUID(),
          },
        });

        const users = await getUsersForGroup({
          workspaceId,
          groupId,
        });

        expect(users).toEqual([userId2, userId]);

        await submitGroup({
          workspaceId,
          data: {
            userId,
            groupId,
            messageId: randomUUID(),
            assigned: false,
          },
        });

        const users2 = await getUsersForGroup({
          workspaceId,
          groupId,
        });

        expect(users2).toEqual([userId2]);
      });
    });
  });

  describe("getGroupsForUser", () => {
    describe("when user is assigned to group and then removed from group", () => {
      it("the return value should reflect the addition and removal", async () => {
        const userId = "user-1";
        const groupId = "group-1";
        const groupId2 = "group-2";

        await submitGroup({
          workspaceId,
          data: {
            userId,
            groupId,
            messageId: randomUUID(),
          },
        });

        await submitGroup({
          workspaceId,
          data: {
            userId,
            groupId: groupId2,
            messageId: randomUUID(),
          },
        });

        const groups = await getGroupsForUser({
          workspaceId,
          userId,
        });

        expect(groups).toEqual([groupId2, groupId]);

        await submitGroup({
          workspaceId,
          data: {
            userId,
            groupId: groupId2,
            messageId: randomUUID(),
            assigned: false,
          },
        });

        const groups2 = await getGroupsForUser({
          workspaceId,
          userId,
        });

        expect(groups2).toEqual([groupId]);
      });
    });
  });
});
