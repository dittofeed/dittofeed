import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { db, insert } from "./db";
import {
  userProperty as dbUserProperty,
  workspace as dbWorkspace,
} from "./db/schema";
import {
  AppFileType,
  BlobStorageFile,
  FileUserPropertyDefinition,
  InternalEventType,
  UserProperty,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyOperatorType,
  Workspace,
} from "./types";
import {
  findAllUserPropertyAssignments,
  findAllUserPropertyAssignmentsForWorkspace,
  findUserIdsByUserPropertyValue,
  insertUserPropertyAssignments,
  UserPropertyBulkUpsertItem,
} from "./userProperties";
import { createWorkspace } from "./workspaces";

describe("userProperties", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    workspace = unwrap(
      await insert({
        table: dbWorkspace,
        values: {
          id: randomUUID(),
          name: `workspace-${randomUUID()}`,
          updatedAt: new Date(),
        },
      }),
    );
  });

  describe("findAllUserPropertyAssignments", () => {
    describe("when passing context with a Performed user property", () => {
      it("should return the user property assignment and override existing values", async () => {
        const upId1 = randomUUID();
        const upId2 = randomUUID();
        const upId3 = randomUUID();

        // Create a user property
        await db()
          .insert(dbUserProperty)
          .values([
            {
              id: upId1,
              workspaceId: workspace.id,
              name: `test-${upId1}`,
              updatedAt: new Date(),
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
              updatedAt: new Date(),
            },
            {
              id: upId3,
              workspaceId: workspace.id,
              name: `test-${upId3}`,
              updatedAt: new Date(),
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
          ]);

        // Existing assignment states
        await insertUserPropertyAssignments([
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
        ]);

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

        await db()
          .insert(dbUserProperty)
          .values({
            id: upId1,
            workspaceId: workspace.id,
            name: `test-${upId1}`,
            definition,
            updatedAt: new Date(),
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
          await insertUserPropertyAssignments(assignments);

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
        await db()
          .insert(dbUserProperty)
          .values([
            {
              id: upId1,
              workspaceId: workspace.id,
              name: `test-${upId1}`,
              updatedAt: new Date(),
              definition: {
                type: UserPropertyDefinitionType.Group,
                entry: "0",
                nodes: [
                  {
                    id: "0",
                    type: UserPropertyDefinitionType.AnyOf,
                    children: ["1", "2", "3", "4"],
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
                  {
                    id: "4",
                    type: UserPropertyDefinitionType.KeyedPerformed,
                    event: "testKeyed",
                    key: "keyPath",
                    path: "keyValuePath",
                  },
                ],
              } satisfies UserPropertyDefinition,
            },
          ]);

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

        const actualAssignments3 = await findAllUserPropertyAssignments({
          userId: "userId",
          workspaceId: workspace.id,
          context: [
            {
              keyPath: "val1",
              keyValuePath: "val2",
            },
          ],
        });

        expect(actualAssignments3).toEqual({
          [`test-${upId1}`]: "val2",
          id: "userId",
        });
      });
    });

    describe("when a user property value is a large number expressed as a string", () => {
      it("it is parsed as a string ", async () => {
        // Create a user property
        const [up] = await db()
          .insert(dbUserProperty)
          .values({
            id: randomUUID(),
            workspaceId: workspace.id,
            name: "largeNumberProp",
            updatedAt: new Date(),
            definition: {
              type: UserPropertyDefinitionType.Trait,
              path: "largeNumber",
            } satisfies UserPropertyDefinition,
          })
          .returning();
        if (!up) {
          throw new Error("Failed to create user property");
        }

        await insertUserPropertyAssignments([
          {
            workspaceId: workspace.id,
            userId: "userId",
            userPropertyId: up.id,
            value: "99999999999999999999999",
          },
        ]);
        const actualAssignments = await findAllUserPropertyAssignments({
          userId: "userId",
          workspaceId: workspace.id,
        });
        expect(typeof actualAssignments.largeNumberProp).toBe("string");
      });
    });
  });

  describe("findAllUserPropertyAssignmentsForWorkspace", () => {
    it("should return the user property assignments for the workspace", async () => {
      const userProperty = unwrap(
        await insert({
          table: dbUserProperty,
          values: {
            id: randomUUID(),
            workspaceId: workspace.id,
            name: "email",
            updatedAt: new Date(),
            definition: {
              type: UserPropertyDefinitionType.Trait,
              path: "email",
            } satisfies UserPropertyDefinition,
          },
        }),
      );
      await insertUserPropertyAssignments([
        {
          workspaceId: workspace.id,
          userId: "userId1",
          userPropertyId: userProperty.id,
          value: "value1",
        },
        {
          workspaceId: workspace.id,
          userId: "userId2",
          userPropertyId: userProperty.id,
          value: "value2",
        },
      ]);

      const assignments = await findAllUserPropertyAssignmentsForWorkspace({
        workspaceId: workspace.id,
      });

      expect(assignments).toEqual({
        userId1: {
          id: "userId1",
          email: "value1",
        },
        userId2: {
          id: "userId2",
          email: "value2",
        },
      });
    });
  });

  describe("findUserIdByUserPropertyValue", () => {
    let userProperty: UserProperty;
    let userId: string;
    beforeEach(async () => {
      userId = randomUUID();

      userProperty = unwrap(
        await insert({
          table: dbUserProperty,
          values: {
            id: randomUUID(),
            workspaceId: workspace.id,
            name: "email",
            updatedAt: new Date(),
            definition: {
              type: UserPropertyDefinitionType.Trait,
              path: "email",
            } satisfies UserPropertyDefinition,
          },
        }),
      );
      await insertUserPropertyAssignments([
        {
          workspaceId: workspace.id,
          userId,
          userPropertyId: userProperty.id,
          value: "max@example.com",
        },
      ]);
    });
    it("should return the user id for the user property value", async () => {
      const actual = await findUserIdsByUserPropertyValue({
        workspaceId: workspace.id,
        userPropertyName: userProperty.name,
        value: "max@example.com",
      });

      expect(actual).toEqual([userId]);
    });
  });
});
