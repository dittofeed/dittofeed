import { randomUUID } from "crypto";

import prisma from "./prisma";
import { UserPropertyDefinition, UserPropertyDefinitionType } from "./types";
import {
  findAllUserPropertyAssignments,
  upsertBulkUserPropertyAssignments,
  UserPropertyBulkUpsertItem,
} from "./userProperties";

describe("findAllUserPropertyAssignments", () => {
  describe("when passing context with a Performed user property", () => {
    it("should return the user property assignment and override existing values", async () => {
      const workspace = await prisma().workspace.create({
        data: {
          name: `test-${randomUUID()}`,
        },
      });

      const upId1 = randomUUID();
      const upId2 = randomUUID();

      // Create a user property
      await prisma().userProperty.createMany({
        data: [
          {
            id: upId1,
            workspaceId: workspace.id,
            name: `test-${upId1}`,
            definition: {
              type: UserPropertyDefinitionType.Performed,
              event: "test",
              path: "nested1.nested2",
            } satisfies UserPropertyDefinition,
          },
          {
            id: upId2,
            workspaceId: workspace.id,
            name: `test-${upId2}`,
            definition: {
              type: UserPropertyDefinitionType.Performed,
              event: "test",
              path: "example",
            } satisfies UserPropertyDefinition,
          },
        ],
      });

      // Existing assignment states
      const assignments: UserPropertyBulkUpsertItem[] = [
        {
          workspaceId: workspace.id,
          userId: "userId",
          userPropertyId: upId1,
          value: "value1",
        },
        {
          workspaceId: workspace.id,
          userId: "userId",
          userPropertyId: upId2,
          value: "value2",
        },
      ];

      await upsertBulkUserPropertyAssignments({ data: assignments });

      // now find properties with contex override
      const actualAssignments = await findAllUserPropertyAssignments({
        userId: "userId",
        workspaceId: workspace.id,
        context: {
          nested1: {
            nested2: "value3",
          },
        },
      });

      expect(actualAssignments).toEqual({
        [`test-${upId1}`]: "value3",
        [`test-${upId2}`]: "value2",
      });
    });
  });

  describe("when passing context with a Group user property", () => {
    it("should return the user property assignment and respect the precedence of earlier group by operations", async () => {
      const workspace = await prisma().workspace.create({
        data: {
          name: `test-${randomUUID()}`,
        },
      });

      const upId1 = randomUUID();

      // Create a user property
      await prisma().userProperty.createMany({
        data: [
          {
            id: upId1,
            workspaceId: workspace.id,
            name: `test-${upId1}`,
            definition: {
              type: UserPropertyDefinitionType.Group,
              entry: "0",
              nodes: [
                {
                  id: "0",
                  type: UserPropertyDefinitionType.AnyOf,
                  children: ["1", "2", "3"],
                },
                {
                  id: "1",
                  type: UserPropertyDefinitionType.Performed,
                  event: "test1",
                  path: "path1",
                },
                {
                  id: "2",
                  type: UserPropertyDefinitionType.Trait,
                  path: "path2",
                },
                {
                  id: "3",
                  type: UserPropertyDefinitionType.Performed,
                  event: "test1",
                  path: "path2",
                },
              ]
            } satisfies UserPropertyDefinition,
          }
        ],
      });

      const actualAssignments1 = await findAllUserPropertyAssignments({
        userId: "userId",
        workspaceId: workspace.id,
        context: {
          path1: 1
        },
      });

      expect(actualAssignments1).toEqual({
        [`test-${upId1}`]: 1,
      });

      const actualAssignments2 = await findAllUserPropertyAssignments({
        userId: "userId",
        workspaceId: workspace.id,
        context: {
          path2: 2
        },
      });

      expect(actualAssignments2).toEqual({
        [`test-${upId1}`]: 2,
      });
    });
  });
});
describe("upsertBulkUserPropertyAssignments", () => {
  it("should not throw when upserting assignments to existing and non-existing user properties", async () => {
    const workspace = await prisma().workspace.create({
      data: {
        name: `test-${randomUUID()}`,
      },
    });
    const userPropertyDefinition: UserPropertyDefinition = {
      type: UserPropertyDefinitionType.Trait,
      path: "email",
    };
    // Create a user property
    const userProperty = await prisma().userProperty.create({
      data: {
        workspaceId: workspace.id,
        name: `test-${randomUUID()}`,
        definition: userPropertyDefinition,
      },
    });

    // Prepare assignments
    const assignments: UserPropertyBulkUpsertItem[] = [
      {
        workspaceId: workspace.id,
        userId: "userId",
        userPropertyId: userProperty.id,
        value: "value1",
      },
      {
        workspaceId: workspace.id,
        userId: "userId",
        userPropertyId: randomUUID(),
        value: "value2",
      },
    ];

    // Attempt to upsert assignments
    await expect(
      upsertBulkUserPropertyAssignments({ data: assignments }),
    ).resolves.not.toThrow();

    // Check that the first assignment was written successfully
    const assignment = await prisma().userPropertyAssignment.findUnique({
      where: {
        workspaceId_userPropertyId_userId: {
          workspaceId: workspace.id,
          userId: "userId",
          userPropertyId: userProperty.id,
        },
      },
    });
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    expect(assignment.value).toEqual("value1");
  });
});
