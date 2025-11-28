import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { submitBatch } from "./apps/batch";
import { db, insert } from "./db";
import {
  segment as dbSegment,
  subscriptionGroup as dbSubscriptionGroup,
  userProperty as dbUserProperty,
  workspace as dbWorkspace,
} from "./db/schema";
import { insertSegmentAssignments } from "./segments";
import {
  updateUserSubscriptions,
  upsertSubscriptionGroup,
} from "./subscriptionGroups";
import {
  ChannelType,
  CursorDirectionEnum,
  EventType,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SubscriptionGroupSegmentNode,
  SubscriptionGroupType,
  UserProperty,
  UserPropertyDefinitionType,
  Workspace,
  WorkspaceTypeAppEnum,
} from "./types";
import { insertUserPropertyAssignments } from "./userProperties";
import { deleteUsers, getUsers, getUsersCount } from "./users";

describe("users", () => {
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

  describe("getUsers", () => {
    describe("when number of users is greater than the limit", () => {
      let userIds: [string, string];
      let firstNameProperty: UserProperty;

      beforeEach(async () => {
        userIds = ["user-1", "user-2"];
        firstNameProperty = unwrap(
          await insert({
            table: dbUserProperty,
            values: {
              id: randomUUID(),
              workspaceId: workspace.id,
              name: "firstName",
              updatedAt: new Date(),
              definition: {
                type: UserPropertyDefinitionType.Trait,
                path: "firstName",
              },
            },
          }),
        );
        await insertUserPropertyAssignments([
          {
            userPropertyId: firstNameProperty.id,
            workspaceId: workspace.id,
            userId: userIds[0],
            value: JSON.stringify("max"),
          },
          {
            userPropertyId: firstNameProperty.id,
            workspaceId: workspace.id,
            value: JSON.stringify("chandler"),
            userId: userIds[1],
          },
        ]);
      });

      it("can be paginated", async () => {
        const result1 = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            limit: 1,
          }),
        );
        expect(
          result1.users.map((user) => user.id),
          "first page shows first user",
        ).toEqual([userIds[0]]);

        expect(result1.nextCursor).not.toBeUndefined();

        const result2 = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            cursor: result1.nextCursor,
            limit: 1,
          }),
        );

        expect(
          result2.users.map((user) => user.id),
          "second page shows second user",
        ).toEqual([userIds[1]]);

        expect(result2.nextCursor).not.toBeUndefined();

        const result3 = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            cursor: result2.nextCursor,
            limit: 1,
          }),
        );

        expect(result3.users, "third page shows no users").toHaveLength(0);
        expect(result3.nextCursor).toBeUndefined();

        const result4 = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            cursor: result2.nextCursor,
            limit: 1,
            direction: CursorDirectionEnum.Before,
          }),
        );

        expect(
          result4.users,
          "when paginating before the final page we have results",
        ).toHaveLength(1);

        expect(result4.users[0]?.id).toEqual(userIds[1]);
        expect(result4.previousCursor).not.toBeUndefined();
      });
    });
    describe("when a subscriptionGroupFilter is passed", () => {
      let userId1: string;

      beforeEach(async () => {
        userId1 = randomUUID();
      });

      describe("when the subscription group is opt-in", () => {
        let subscriptionGroupId: string;
        let userPropertyId: string;
        let segmentId: string;
        beforeEach(async () => {
          subscriptionGroupId = randomUUID();
          userPropertyId = randomUUID();
          segmentId = randomUUID();
          await Promise.all([
            db().insert(dbSubscriptionGroup).values({
              id: subscriptionGroupId,
              workspaceId: workspace.id,
              name: "subscriptionGroup1",
              updatedAt: new Date(),
              type: SubscriptionGroupType.OptIn,
              channel: ChannelType.Email,
            }),
            db()
              .insert(dbUserProperty)
              .values({
                id: userPropertyId,
                workspaceId: workspace.id,
                name: "id",
                updatedAt: new Date(),
                definition: {
                  type: UserPropertyDefinitionType.Id,
                },
              }),
          ]);
          await db()
            .insert(dbSegment)
            .values({
              id: segmentId,
              workspaceId: workspace.id,
              name: "segment1",
              updatedAt: new Date(),
              subscriptionGroupId,
              definition: {
                type: SegmentNodeType.SubscriptionGroup,
                id: "1",
                subscriptionGroupId,
                subscriptionGroupType: SubscriptionGroupType.OptIn,
              } satisfies SubscriptionGroupSegmentNode,
            });
        });
        describe("when a user hasn't opted in or out", () => {
          beforeEach(async () => {
            await insertUserPropertyAssignments([
              {
                userPropertyId,
                userId: userId1,
                workspaceId: workspace.id,
                value: JSON.stringify(userId1),
              },
            ]);
          });
          it("the user is not included in the results", async () => {
            const result = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                subscriptionGroupFilter: [subscriptionGroupId],
              }),
            );
            expect(result.users).toHaveLength(0);
          });
        });
        describe("when a user has opted in", () => {
          beforeEach(async () => {
            await Promise.all([
              insertUserPropertyAssignments([
                {
                  userPropertyId,
                  userId: userId1,
                  workspaceId: workspace.id,
                  value: JSON.stringify(userId1),
                },
              ]),
              insertSegmentAssignments([
                {
                  segmentId,
                  userId: userId1,
                  workspaceId: workspace.id,
                  inSegment: true,
                },
              ]),
            ]);
          });
          it("the user is included in the results", async () => {
            const result = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                subscriptionGroupFilter: [subscriptionGroupId],
              }),
            );
            expect(result.users).toHaveLength(1);
          });
        });
        describe("when a user has opted out", () => {
          beforeEach(async () => {
            await Promise.all([
              insertUserPropertyAssignments([
                {
                  userPropertyId,
                  userId: userId1,
                  workspaceId: workspace.id,
                  value: JSON.stringify(userId1),
                },
              ]),
              insertSegmentAssignments([
                {
                  segmentId,
                  userId: userId1,
                  workspaceId: workspace.id,
                  inSegment: false,
                },
              ]),
            ]);
          });
          it("the user is not included in the results", async () => {
            const result = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                subscriptionGroupFilter: [subscriptionGroupId],
              }),
            );
            expect(result.users).toHaveLength(0);
          });
        });
      });
    });

    describe("when a segmentId is passed", () => {
      let userIds: [string, string, string];
      let segmentId1: string;

      beforeEach(async () => {
        userIds = [
          "185410bb-60e0-407a-95bb-4568ad450ff9",
          "787ec382-1f3a-4375-ae7d-2dae8b863991",
          "41ca3e31-0bed-4d48-9306-d3a2d4acc025",
        ];
        const segmentDefinition1: SegmentDefinition = {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: "1",
            path: "node1",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "value1",
            },
          },
          nodes: [],
        };
        const segmentDefinition2: SegmentDefinition = {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: "node2",
            path: "key2",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "value2",
            },
          },
          nodes: [],
        };
        segmentId1 = randomUUID();
        const segmentId2 = randomUUID();

        await Promise.all([
          insert({
            table: dbSegment,
            values: {
              id: segmentId1,
              workspaceId: workspace.id,
              name: "segment1",
              updatedAt: new Date(),
              definition: segmentDefinition1,
            },
          }),
          insert({
            table: dbSegment,
            values: {
              id: segmentId2,
              workspaceId: workspace.id,
              name: "segment2",
              updatedAt: new Date(),
              definition: segmentDefinition2,
            },
          }),
        ]);

        await insertSegmentAssignments([
          {
            userId: userIds[0],
            inSegment: true,
            segmentId: segmentId1,
            workspaceId: workspace.id,
          },
          {
            userId: userIds[1],
            inSegment: false,
            segmentId: segmentId1,
            workspaceId: workspace.id,
          },
          {
            userId: userIds[2],
            inSegment: true,
            segmentId: segmentId2,
            workspaceId: workspace.id,
          },
        ]);
      });

      it("filters users by segment id", async () => {
        const result = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            segmentFilter: [segmentId1],
          }),
        );

        expect(result).toEqual({
          userCount: 0,
          users: [
            {
              id: userIds[0],
              segments: [
                {
                  id: segmentId1,
                  name: "segment1",
                },
              ],
              properties: {},
            },
          ],
        });
      });
    });

    describe("when a segmentId and subscriptionGroupFilter are passed", () => {
      let userIds: [string, string, string];
      let segmentId1: string;
      let subscriptionGroupId: string;
      beforeEach(async () => {
        subscriptionGroupId = randomUUID();
        userIds = ["user-1", "user-2", "user-3"];
        const segmentDefinition1: SegmentDefinition = {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: "1",
            path: "node1",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "value1",
            },
          },
          nodes: [],
        };
        segmentId1 = randomUUID();
        await insert({
          table: dbSegment,
          values: {
            id: segmentId1,
            workspaceId: workspace.id,
            name: "segment1",
            updatedAt: new Date(),
            definition: segmentDefinition1,
          },
        });

        await insertSegmentAssignments([
          {
            userId: userIds[0],
            inSegment: true,
            segmentId: segmentId1,
            workspaceId: workspace.id,
          },
          {
            userId: userIds[1],
            inSegment: false,
            segmentId: segmentId1,
            workspaceId: workspace.id,
          },
          {
            userId: userIds[2],
            inSegment: true,
            segmentId: segmentId1,
            workspaceId: workspace.id,
          },
        ]);
      });

      describe("when the subscription group is opt-in", () => {
        beforeEach(async () => {
          await upsertSubscriptionGroup({
            id: subscriptionGroupId,
            workspaceId: workspace.id,
            name: "subscriptionGroup1",
            type: SubscriptionGroupType.OptIn,
            channel: ChannelType.Email,
          });
          await updateUserSubscriptions({
            workspaceId: workspace.id,
            userUpdates: [
              {
                userId: userIds[0],
                changes: {
                  [subscriptionGroupId]: true,
                },
              },
              {
                userId: userIds[1],
                changes: {
                  [subscriptionGroupId]: true,
                },
              },
            ],
          });
        });
        it("filters users by segment id and subscription group id", async () => {
          const result = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              segmentFilter: [segmentId1],
              subscriptionGroupFilter: [subscriptionGroupId],
            }),
          );

          expect(
            result,
            "only includes user that has both segment and subscription group",
          ).toEqual(
            expect.objectContaining({
              users: [
                {
                  id: userIds[0],
                  segments: [
                    {
                      id: segmentId1,
                      name: "segment1",
                    },
                  ],
                  properties: {},
                },
              ],
            }),
          );
          const { userCount } = unwrap(
            await getUsersCount({
              workspaceId: workspace.id,
              segmentFilter: [segmentId1],
              subscriptionGroupFilter: [subscriptionGroupId],
            }),
          );
          expect(userCount).toEqual(1);
        });
      });
    });
  });

  describe("deleteUsers", () => {
    let userIds: [string, string];

    beforeEach(async () => {
      userIds = [
        "185410bb-60e0-407a-95bb-4568ad450ff9",
        "787ec382-1f3a-4375-ae7d-2dae8b863991",
      ];
      const firstNameProperty = unwrap(
        await insert({
          table: dbUserProperty,
          values: {
            id: randomUUID(),
            workspaceId: workspace.id,
            name: "firstName",
            updatedAt: new Date(),
            definition: {
              type: UserPropertyDefinitionType.Trait,
              path: "firstName",
            },
          },
        }),
      );
      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [
            {
              userId: userIds[0],
              type: EventType.Identify,
              messageId: "1",
              traits: {
                firstName: "max",
              },
            },
            {
              userId: userIds[1],
              type: EventType.Identify,
              messageId: "2",
              traits: {
                firstName: "chandler",
              },
            },
          ],
        },
      });
      await insertUserPropertyAssignments([
        {
          userPropertyId: firstNameProperty.id,
          workspaceId: workspace.id,
          userId: userIds[0],
          value: JSON.stringify("max"),
        },
        {
          userPropertyId: firstNameProperty.id,
          workspaceId: workspace.id,
          userId: userIds[1],
          value: JSON.stringify("chandler"),
        },
      ]);
    });
    it("deletes users", async () => {
      await deleteUsers({
        workspaceId: workspace.id,
        userIds: [userIds[0]],
      });
      // eslint-disable-next-line no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const users = await getUsers({
        workspaceId: workspace.id,
      });
      expect(unwrap(users).users).toHaveLength(1);
      expect(unwrap(users).users[0]?.id).toEqual(userIds[1]);
    });
  });
  describe("getUsers", () => {
    describe("when a parent workspace is passed", () => {
      let parentWorkspace: Workspace;
      let childWorkspace1: Workspace;
      let childWorkspace2: Workspace;
      beforeEach(async () => {
        parentWorkspace = unwrap(
          await insert({
            table: dbWorkspace,
            values: {
              name: `parentWorkspace-${randomUUID()}`,
              type: WorkspaceTypeAppEnum.Parent,
            },
          }),
        );
        childWorkspace1 = unwrap(
          await insert({
            table: dbWorkspace,
            values: {
              name: "childWorkspace1",
              parentWorkspaceId: parentWorkspace.id,
              type: WorkspaceTypeAppEnum.Child,
            },
          }),
        );
        childWorkspace2 = unwrap(
          await insert({
            table: dbWorkspace,
            values: {
              name: "childWorkspace2",
              parentWorkspaceId: parentWorkspace.id,
              type: WorkspaceTypeAppEnum.Child,
            },
          }),
        );

        const [emailProperty1, emailProperty2] = await Promise.all([
          insert({
            table: dbUserProperty,
            values: {
              workspaceId: childWorkspace1.id,
              name: "email",
              definition: {
                type: UserPropertyDefinitionType.Trait,
                path: "email",
              },
            },
          }).then(unwrap),
          insert({
            table: dbUserProperty,
            values: {
              workspaceId: childWorkspace2.id,
              name: "email",
              definition: {
                type: UserPropertyDefinitionType.Trait,
                path: "email",
              },
            },
          }).then(unwrap),
        ]);
        await Promise.all([
          insertUserPropertyAssignments([
            {
              userPropertyId: emailProperty1.id,
              workspaceId: childWorkspace1.id,
              userId: "user-1",
              value: JSON.stringify("max@example.com"),
            },
            {
              userPropertyId: emailProperty2.id,
              workspaceId: childWorkspace2.id,
              userId: "user-2",
              value: JSON.stringify("joe@example.com"),
            },
          ]),
        ]);
      });
      it("returns users from all child workspaces with user properties set", async () => {
        const result = unwrap(
          await getUsers({
            workspaceId: parentWorkspace.id,
          }),
        );
        expect(result.users).toHaveLength(2);
        expect(result.users.map((user) => user.id).sort()).toEqual([
          "user-1",
          "user-2",
        ]);
        expect(Object.values(result.users[0]?.properties ?? {})[0]).toEqual({
          name: "email",
          value: "max@example.com",
        });
        expect(Object.values(result.users[1]?.properties ?? {})[0]).toEqual({
          name: "email",
          value: "joe@example.com",
        });
      });
    });
  });
});
