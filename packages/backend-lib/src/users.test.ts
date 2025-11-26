import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { sleep } from "isomorphic-lib/src/time";

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
import { upsertUserPropertyIndex } from "./userPropertyIndices";
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

      describe("when the subscription group is opt-out", () => {
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
              type: SubscriptionGroupType.OptOut,
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
                subscriptionGroupType: SubscriptionGroupType.OptOut,
              } satisfies SubscriptionGroupSegmentNode,
            });
        });
        describe("when a user hasn't opted out", () => {
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
      });

      describe("sorting", () => {
        it("sorts by numeric indexed property", async () => {
          const ageProperty = unwrap(
            await insert({
              table: dbUserProperty,
              values: {
                id: randomUUID(),
                workspaceId: workspace.id,
                name: "age",
                updatedAt: new Date(),
                definition: {
                  type: UserPropertyDefinitionType.Trait,
                  path: "age",
                },
              },
            }),
          );

          await insertUserPropertyAssignments([
            {
              workspaceId: workspace.id,
              userPropertyId: ageProperty.id,
              userId: "user-1",
              value: JSON.stringify(30),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: ageProperty.id,
              userId: "user-2",
              value: JSON.stringify(25),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: ageProperty.id,
              userId: "user-3",
              value: JSON.stringify(25),
            },
          ]);

          await upsertUserPropertyIndex({
            workspaceId: workspace.id,
            userPropertyId: ageProperty.id,
            type: "Number",
          });

          await sleep(250);

          const result = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              sortBy: ageProperty.id,
            }),
          );

          expect(result.users.map((u) => u.id)).toEqual([
            "user-2",
            "user-3",
            "user-1",
          ]);
          expect(
            result.users.map((u) => u.properties[ageProperty.id]?.value),
          ).toEqual([25, 25, 30]);
        });

        it("sorts in reverse when direction is before", async () => {
          const scoreProperty = unwrap(
            await insert({
              table: dbUserProperty,
              values: {
                id: randomUUID(),
                workspaceId: workspace.id,
                name: "score-reverse",
                updatedAt: new Date(),
                definition: {
                  type: UserPropertyDefinitionType.Trait,
                  path: "scoreReverse",
                },
              },
            }),
          );

          await insertUserPropertyAssignments([
            {
              workspaceId: workspace.id,
              userPropertyId: scoreProperty.id,
              userId: "user-a",
              value: JSON.stringify(10),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: scoreProperty.id,
              userId: "user-b",
              value: JSON.stringify(20),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: scoreProperty.id,
              userId: "user-c",
              value: JSON.stringify(30),
            },
          ]);

          await upsertUserPropertyIndex({
            workspaceId: workspace.id,
            userPropertyId: scoreProperty.id,
            type: "Number",
          });

          await sleep(250);

          const result = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              sortBy: scoreProperty.id,
              direction: CursorDirectionEnum.Before,
              limit: 3,
            }),
          );

          expect(result.users.map((u) => u.id)).toEqual([
            "user-c",
            "user-b",
            "user-a",
          ]);
          expect(
            result.users.map((u) => u.properties[scoreProperty.id]?.value),
          ).toEqual([30, 20, 10]);
        });

        it("sorts by string indexed property", async () => {
          const nameProperty = unwrap(
            await insert({
              table: dbUserProperty,
              values: {
                id: randomUUID(),
                workspaceId: workspace.id,
                name: "name",
                updatedAt: new Date(),
                definition: {
                  type: UserPropertyDefinitionType.Trait,
                  path: "name",
                },
              },
            }),
          );

          await insertUserPropertyAssignments([
            {
              workspaceId: workspace.id,
              userPropertyId: nameProperty.id,
              userId: "user-1",
              value: JSON.stringify("Charlie"),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: nameProperty.id,
              userId: "user-2",
              value: JSON.stringify("Alice"),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: nameProperty.id,
              userId: "user-3",
              value: JSON.stringify("Bob"),
            },
          ]);

          await upsertUserPropertyIndex({
            workspaceId: workspace.id,
            userPropertyId: nameProperty.id,
            type: "String",
          });

          await sleep(250);

          const result = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              sortBy: nameProperty.id,
            }),
          );

          expect(result.users.map((u) => u.id)).toEqual([
            "user-2",
            "user-3",
            "user-1",
          ]);
          expect(
            result.users.map((u) => u.properties[nameProperty.id]?.value),
          ).toEqual(["Alice", "Bob", "Charlie"]);
        });

        it("sorts by date indexed property", async () => {
          const signupProperty = unwrap(
            await insert({
              table: dbUserProperty,
              values: {
                id: randomUUID(),
                workspaceId: workspace.id,
                name: "signupDate",
                updatedAt: new Date(),
                definition: {
                  type: UserPropertyDefinitionType.Trait,
                  path: "signupDate",
                },
              },
            }),
          );

          await insertUserPropertyAssignments([
            {
              workspaceId: workspace.id,
              userPropertyId: signupProperty.id,
              userId: "user-1",
              value: JSON.stringify("2024-01-02T00:00:00.000Z"),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: signupProperty.id,
              userId: "user-2",
              value: JSON.stringify("2024-01-01T00:00:00.000Z"),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: signupProperty.id,
              userId: "user-3",
              value: JSON.stringify("2024-01-02T00:00:00.000Z"),
            },
          ]);

          await upsertUserPropertyIndex({
            workspaceId: workspace.id,
            userPropertyId: signupProperty.id,
            type: "Date",
          });

          await sleep(250);

          const result = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              sortBy: signupProperty.id,
            }),
          );

          expect(result.users.map((u) => u.id)).toEqual([
            "user-2",
            "user-1",
            "user-3",
          ]);
          expect(
            result.users.map((u) => u.properties[signupProperty.id]?.value),
          ).toEqual([
            "2024-01-01T00:00:00.000Z",
            "2024-01-02T00:00:00.000Z",
            "2024-01-02T00:00:00.000Z",
          ]);
        });

        it("paginates across indexed and remainder users at the seam", async () => {
          const presenceProperty = unwrap(
            await insert({
              table: dbUserProperty,
              values: {
                id: randomUUID(),
                workspaceId: workspace.id,
                name: "presence",
                updatedAt: new Date(),
                definition: {
                  type: UserPropertyDefinitionType.Trait,
                  path: "presence",
                },
              },
            }),
          );
          const scoreProperty = unwrap(
            await insert({
              table: dbUserProperty,
              values: {
                id: randomUUID(),
                workspaceId: workspace.id,
                name: "score",
                updatedAt: new Date(),
                definition: {
                  type: UserPropertyDefinitionType.Trait,
                  path: "score",
                },
              },
            }),
          );

          const indexedUsers = Array.from(
            { length: 10 },
            (_, i) => `indexed-${String(i + 1).padStart(2, "0")}`,
          );
          const remainderUsers = Array.from(
            { length: 10 },
            (_, i) => `remainder-${String(i + 1).padStart(2, "0")}`,
          );

          await insertUserPropertyAssignments([
            ...indexedUsers.map((id, i) => ({
              workspaceId: workspace.id,
              userPropertyId: presenceProperty.id,
              userId: id,
              value: JSON.stringify("present"),
            })),
            ...remainderUsers.map((id) => ({
              workspaceId: workspace.id,
              userPropertyId: presenceProperty.id,
              userId: id,
              value: JSON.stringify("present"),
            })),
            ...indexedUsers.map((id, i) => ({
              workspaceId: workspace.id,
              userPropertyId: scoreProperty.id,
              userId: id,
              value: JSON.stringify(i + 1),
            })),
          ]);

          await upsertUserPropertyIndex({
            workspaceId: workspace.id,
            userPropertyId: scoreProperty.id,
            type: "Number",
          });

          await sleep(250);

          const pageSize = 7;
          const page1 = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              sortBy: scoreProperty.id,
              limit: pageSize,
            }),
          );

          expect(page1.users.map((u) => u.id)).toEqual(
            indexedUsers.slice(0, pageSize),
          );
          expect(page1.nextCursor).toBeDefined();

          const page2 = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              sortBy: scoreProperty.id,
              limit: pageSize,
              cursor: page1.nextCursor,
            }),
          );

          expect(page2.users.map((u) => u.id)).toEqual([
            ...indexedUsers.slice(pageSize, 10),
            ...remainderUsers.slice(0, pageSize - (10 - pageSize)),
          ]);
          expect(page2.nextCursor).toBeDefined();

          const page3 = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              sortBy: scoreProperty.id,
              limit: pageSize,
              cursor: page2.nextCursor,
            }),
          );

          expect(page3.users.map((u) => u.id)).toEqual(
            remainderUsers.slice(pageSize - (10 - pageSize)),
          );
        });

        it("falls back to user_id sorting when sortBy is not provided", async () => {
          const baseProperty = unwrap(
            await insert({
              table: dbUserProperty,
              values: {
                id: randomUUID(),
                workspaceId: workspace.id,
                name: "identifier",
                updatedAt: new Date(),
                definition: {
                  type: UserPropertyDefinitionType.Trait,
                  path: "identifier",
                },
              },
            }),
          );

          await insertUserPropertyAssignments([
            {
              workspaceId: workspace.id,
              userPropertyId: baseProperty.id,
              userId: "user-b",
              value: JSON.stringify("b"),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: baseProperty.id,
              userId: "user-a",
              value: JSON.stringify("a"),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: baseProperty.id,
              userId: "user-c",
              value: JSON.stringify("c"),
            },
          ]);

          const result = unwrap(
            await getUsers({
              workspaceId: workspace.id,
            }),
          );

          expect(result.users.map((u) => u.id)).toEqual([
            "user-a",
            "user-b",
            "user-c",
          ]);
        });
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

      describe("when the subscription group is opt-out", () => {
        beforeEach(async () => {
          await upsertSubscriptionGroup({
            id: subscriptionGroupId,
            workspaceId: workspace.id,
            name: "subscriptionGroup1",
            type: SubscriptionGroupType.OptOut,
            channel: ChannelType.Email,
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

          expect(result.users).toHaveLength(2);
          expect(result.users.map((user) => user.id).sort()).toEqual([
            userIds[0],
            userIds[2],
          ]);
          const { userCount } = unwrap(
            await getUsersCount({
              workspaceId: workspace.id,
              segmentFilter: [segmentId1],
              subscriptionGroupFilter: [subscriptionGroupId],
            }),
          );
          expect(userCount).toEqual(2);
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
