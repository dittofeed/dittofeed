import { randomUUID } from "crypto";

import prisma from "./prisma";
import {
  AppFileType,
  BlobStorageFile,
  FileUserPropertyDefinition,
  InternalEventType,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyOperatorType,
  Workspace,
} from "./types";
import {
  findAllUserPropertyAssignments,
  upsertBulkUserPropertyAssignments,
  UserPropertyBulkUpsertItem,
} from "./userProperties";

describe("findAllUserPropertyAssignments", () => {
  let workspace: Workspace;
  beforeEach(async () => {
    workspace = await prisma().workspace.create({
      data: {
        name: `test-${randomUUID()}`,
      },
    });
  });

  describe("when passing context with a Performed user property", () => {
    it("should return the user property assignment and override existing values", async () => {
      const upId1 = randomUUID();
      const upId2 = randomUUID();
      const upId3 = randomUUID();

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
          {
            id: upId3,
            workspaceId: workspace.id,
            name: `test-${upId3}`,
            definition: {
              type: UserPropertyDefinitionType.Performed,
              event: "test",
              path: "propertyRestrictedPath",
              properties: [
                {
                  path: "key1",
                  operator: {
                    type: UserPropertyOperatorType.Equals,
                    value: "matchesProperty",
                  },
                },
              ],
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
        context: [
          {
            nested1: {
              nested2: "value3",
            },
          },
          {
            propertyRestrictedPath: "valueForMatching",
            key1: "matchesProperty",
          },
          {
            propertyRestrictedPath: "invalid",
            key1: "doesNotMatchProperty",
          },
        ],
      });

      expect(actualAssignments).toEqual({
        // pulls from context when able
        [`test-${upId1}`]: "value3",
        // falls back to existing assignment
        [`test-${upId2}`]: "value2",
        // checks properties before using context
        [`test-${upId3}`]: "valueForMatching",
        // always returns user id
        id: "userId",
      });
    });
  });

  describe("with a file user property", () => {
    let upId1: string;
    let definition: FileUserPropertyDefinition;
    let value: Omit<BlobStorageFile, "name">;

    beforeEach(async () => {
      upId1 = randomUUID();

      definition = {
        type: UserPropertyDefinitionType.File,
        name: "myFile.pdf",
      };

      await prisma().userProperty.create({
        data: {
          id: upId1,
          workspaceId: workspace.id,
          name: `test-${upId1}`,
          definition,
        },
      });

      value = {
        type: AppFileType.BlobStorage,
        key: "/path/to/myFile.pdf",
        mimeType: "application/pdf",
      } satisfies Omit<BlobStorageFile, "name">;
    });
    describe("when passing context", () => {
      it("should use the name of the user property", async () => {
        const actualAssignments = await findAllUserPropertyAssignments({
          userId: "userId",
          workspaceId: workspace.id,
          context: [
            {
              [InternalEventType.AttachedFiles]: {
                [definition.name]: {
                  ...value,
                },
              },
            },
          ],
        });

        expect(actualAssignments).toEqual({
          [`test-${upId1}`]: {
            ...value,
            name: "myFile.pdf",
          },
          id: "userId",
        });
      });
    });

    describe("when loading from a user property", () => {
      it("should return the user property assignment", async () => {
        const assignments: UserPropertyBulkUpsertItem[] = [
          {
            workspaceId: workspace.id,
            userId: "userId",
            userPropertyId: upId1,
            value: JSON.stringify(value),
          },
        ];
        await upsertBulkUserPropertyAssignments({ data: assignments });

        const actualAssignments = await findAllUserPropertyAssignments({
          userId: "userId",
          workspaceId: workspace.id,
        });

        expect(actualAssignments).toEqual({
          [`test-${upId1}`]: {
            ...value,
            name: "myFile.pdf",
          },
          id: "userId",
        });
      });
    });
  });

  describe("when passing context with a Group user property", () => {
    it("should return the user property assignment and respect the precedence of earlier group by operations", async () => {
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
              ],
            } satisfies UserPropertyDefinition,
          },
        ],
      });

      const actualAssignments1 = await findAllUserPropertyAssignments({
        userId: "userId",
        workspaceId: workspace.id,
        context: [
          {
            path1: 1,
          },
        ],
      });

      expect(actualAssignments1).toEqual({
        [`test-${upId1}`]: 1,
        id: "userId",
      });

      const actualAssignments2 = await findAllUserPropertyAssignments({
        userId: "userId",
        workspaceId: workspace.id,
        context: [
          {
            path2: 2,
          },
        ],
      });

      expect(actualAssignments2).toEqual({
        [`test-${upId1}`]: 2,
        id: "userId",
      });
    });
  });

  describe("when a user property value is a large number expressed as a string", () => {
    it("it is parsed as a string ", async () => {
      // Create a user property
      const up = await prisma().userProperty.create({
        data: {
          workspaceId: workspace.id,
          name: "largeNumberProp",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "largeNumber",
          } satisfies UserPropertyDefinition,
        },
      });

      const assignments: UserPropertyBulkUpsertItem[] = [
        {
          workspaceId: workspace.id,
          userId: "userId",
          userPropertyId: up.id,
          value: "99999999999999999999999",
        },
      ];

      await upsertBulkUserPropertyAssignments({ data: assignments });
      const actualAssignments = await findAllUserPropertyAssignments({
        userId: "userId",
        workspaceId: workspace.id,
      });
      expect(typeof actualAssignments.largeNumberProp).toBe("string");
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
