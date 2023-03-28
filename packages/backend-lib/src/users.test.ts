import { Workspace } from "@prisma/client";
import { randomUUID } from "crypto";

import prisma from "./prisma";
import { UserPropertyDefinitionType } from "./types";
import { getUsers } from "./users";

describe("getUsers", () => {
  describe("when number of users is greater than the limit", () => {
    let workspace: Workspace;
    let userIds: [string, string];

    beforeEach(async () => {
      workspace = await prisma().workspace.create({
        data: {
          name: `workspace-${randomUUID()}`,
        },
      });
      userIds = [
        "185410bb-60e0-407a-95bb-4568ad450ff9",
        "787ec382-1f3a-4375-ae7d-2dae8b863991",
      ];
      const firstNameProperty = await prisma().userProperty.create({
        data: {
          name: "firstName",
          workspaceId: workspace.id,
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "firstName",
          },
        },
      });
      await prisma().userPropertyAssignment.createMany({
        data: [
          {
            userPropertyId: firstNameProperty.id,
            workspaceId: workspace.id,
            userId: userIds[0],
            value: "max",
          },
          {
            userPropertyId: firstNameProperty.id,
            workspaceId: workspace.id,
            userId: userIds[1],
            value: "chandler",
          },
        ],
      });
    });

    it("can be paginated", async () => {
      const result1 = await getUsers({
        workspaceId: workspace.id,
        limit: 1,
      });
      expect(result1.users).toEqual([
        {
          id: userIds[0],
          segments: {},
          properties: {
            firstName: "max",
          },
        },
      ]);
      expect(result1.nextCursor).not.toBeUndefined();

      const result2 = await getUsers({
        workspaceId: workspace.id,
        afterCursor: result1.nextCursor,
        limit: 1,
      });

      expect(result2.users).toEqual([
        {
          id: userIds[1],
          segments: {},
          properties: {
            firstName: "chandler",
          },
        },
      ]);
      expect(result2.nextCursor).not.toBeUndefined();

      const result3 = await getUsers({
        workspaceId: workspace.id,
        afterCursor: result2.nextCursor,
        limit: 1,
      });

      expect(result3.users).toHaveLength(0);
      expect(result3.nextCursor).toBeUndefined();
    });
  });
});
