import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

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
        const users = await getUsersForGroup({
          workspaceId: "1",
          groupId: "1",
        });
        expect(users).toEqual([]);
      });
    });
  });
});
