import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { submitGroup } from "./apps";
import { getUsersForGroup } from "./groups";
import { createWorkspace } from "./workspaces";

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
        expect(users).toEqual([userId, userId2]);
      });
    });
  });
});
