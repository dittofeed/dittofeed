import { randomUUID } from "crypto";

import prisma from "./prisma";
import { UserPropertyDefinition, UserPropertyDefinitionType } from "./types";
import {
  upsertBulkUserPropertyAssignments,
  UserPropertyBulkUpsertItem,
} from "./userProperties";

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
      upsertBulkUserPropertyAssignments({ data: assignments })
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
