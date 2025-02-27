import { getUsersForGroup } from "./groups";

describe("groups", () => {
  describe("getUsersForGroup", () => {
    it("should get users for group", async () => {
      const users = await getUsersForGroup({
        workspaceId: "1",
        groupId: "1",
      });
      expect(users).toEqual([]);
    });
  });
});
