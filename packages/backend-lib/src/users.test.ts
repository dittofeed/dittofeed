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
  getSubscriptionGroupUnsubscribedSegmentName,
  updateUserSubscriptions,
  upsertSubscriptionGroup,
} from "./subscriptionGroups";
import {
  ChannelType,
  CursorDirectionEnum,
  EventType,
  GetUsersResponseItem,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SortOrderEnum,
  SubscriptionGroupSegmentNode,
  SubscriptionGroupType,
  UserProperty,
  UserPropertyDefinitionType,
  UserSubscriptionItem,
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

      it("returns EXACTLY the same first page after navigating forward then back using previousCursor with exclusiveCursor (limit=1)", async () => {
        // This test verifies the round-trip pagination scenario with exclusiveCursor=true:
        // 1. Load page 1 (no cursor)
        // 2. Load page 2 (using nextCursor from page 1)
        // 3. Go back to page 1 (using previousCursor from page 2 with exclusiveCursor=true)
        // 4. Expect to see the SAME users as step 1

        // Step 1: Load initial page 1
        const page1 = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            limit: 1,
          }),
        );
        const initialFirstUserId = page1.users[0]?.id;
        expect(initialFirstUserId).toBe(userIds[0]);
        expect(page1.nextCursor).toBeDefined();

        // Step 2: Load page 2
        const page2 = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            cursor: page1.nextCursor,
            limit: 1,
          }),
        );
        expect(page2.users[0]?.id).toBe(userIds[1]);
        expect(page2.previousCursor).toBeDefined();

        // Step 3: Go back to page 1 using previousCursor with exclusiveCursor=true
        const backToPage1 = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            cursor: page2.previousCursor,
            direction: CursorDirectionEnum.Before,
            exclusiveCursor: true, // This makes the cursor comparison exclusive
            limit: 1,
          }),
        );

        // Step 4: Verify we get the SAME first user as step 1
        expect(
          backToPage1.users[0]?.id,
          `Expected to return to first user "${initialFirstUserId}" but got "${backToPage1.users[0]?.id}"`,
        ).toBe(initialFirstUserId);
      });

      it("returns EXACTLY the same first page after navigating forward then back using previousCursor with exclusiveCursor (limit=2)", async () => {
        // This test verifies the round-trip pagination with limit=2 (multiple items per page)
        // Need 4 users for this test
        const fourUserIds = ["user-a", "user-b", "user-c", "user-d"];
        await insertUserPropertyAssignments(
          fourUserIds.map((userId, index) => ({
            userPropertyId: firstNameProperty.id,
            workspaceId: workspace.id,
            userId,
            value: JSON.stringify(`name-${index}`),
          })),
        );

        // Step 1: Load initial page 1
        const page1 = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            limit: 2,
          }),
        );
        const page1UserIds = page1.users.map((u) => u.id);
        expect(page1UserIds).toHaveLength(2);
        expect(page1.nextCursor).toBeDefined();

        // Step 2: Load page 2
        const page2 = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            cursor: page1.nextCursor,
            direction: CursorDirectionEnum.After,
            limit: 2,
          }),
        );
        expect(page2.users).toHaveLength(2);
        expect(page2.previousCursor).toBeDefined();

        // Step 3: Go back to page 1 using previousCursor with exclusiveCursor=true
        const backToPage1 = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            cursor: page2.previousCursor,
            direction: CursorDirectionEnum.Before,
            exclusiveCursor: true,
            limit: 2,
          }),
        );

        // Step 4: Verify we get the SAME first page
        expect(
          backToPage1.users.map((u) => u.id),
          `Expected to return to first page ${page1UserIds} but got ${backToPage1.users.map((u) => u.id)}`,
        ).toEqual(page1UserIds);
      });
    });
    describe("when a subscriptionGroupFilter is passed", () => {
      let userId1: string;

      beforeEach(() => {
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

        it("paginates correctly with direction before", async () => {
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

          // First get page 1 (ascending order by default)
          const page1 = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              sortBy: scoreProperty.id,
              limit: 2,
            }),
          );

          expect(page1.users.map((u) => u.id)).toEqual(["user-a", "user-b"]);
          expect(page1.nextCursor).toBeDefined();

          // Now paginate backward from page 1's next cursor
          // The nextCursor points to user-b, so paginating Before should return users at or before that point
          const result = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              sortBy: scoreProperty.id,
              direction: CursorDirectionEnum.Before,
              cursor: page1.nextCursor,
              limit: 3,
            }),
          );

          // Should return user-a and user-b (cursor is inclusive for Before direction)
          expect(result.users.map((u) => u.id)).toEqual(["user-a", "user-b"]);
          expect(
            result.users.map((u) => u.properties[scoreProperty.id]?.value),
          ).toEqual([10, 20]);
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

        it("sorts in descending order when sortOrder is desc", async () => {
          const rankProperty = unwrap(
            await insert({
              table: dbUserProperty,
              values: {
                id: randomUUID(),
                workspaceId: workspace.id,
                name: "rank",
                updatedAt: new Date(),
                definition: {
                  type: UserPropertyDefinitionType.Trait,
                  path: "rank",
                },
              },
            }),
          );

          await insertUserPropertyAssignments([
            {
              workspaceId: workspace.id,
              userPropertyId: rankProperty.id,
              userId: "user-x",
              value: JSON.stringify(100),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: rankProperty.id,
              userId: "user-y",
              value: JSON.stringify(200),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: rankProperty.id,
              userId: "user-z",
              value: JSON.stringify(150),
            },
          ]);

          await upsertUserPropertyIndex({
            workspaceId: workspace.id,
            userPropertyId: rankProperty.id,
            type: "Number",
          });

          await sleep(250);

          const resultAsc = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              sortBy: rankProperty.id,
              sortOrder: SortOrderEnum.Asc,
            }),
          );

          expect(resultAsc.users.map((u) => u.id)).toEqual([
            "user-x",
            "user-z",
            "user-y",
          ]);
          expect(
            resultAsc.users.map((u) => u.properties[rankProperty.id]?.value),
          ).toEqual([100, 150, 200]);

          const resultDesc = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              sortBy: rankProperty.id,
              sortOrder: SortOrderEnum.Desc,
            }),
          );

          expect(resultDesc.users.map((u) => u.id)).toEqual([
            "user-y",
            "user-z",
            "user-x",
          ]);
          expect(
            resultDesc.users.map((u) => u.properties[rankProperty.id]?.value),
          ).toEqual([200, 150, 100]);
        });

        it("sorts in descending order by user_id when sortOrder is desc without sortBy", async () => {
          const tagProperty = unwrap(
            await insert({
              table: dbUserProperty,
              values: {
                id: randomUUID(),
                workspaceId: workspace.id,
                name: "tag",
                updatedAt: new Date(),
                definition: {
                  type: UserPropertyDefinitionType.Trait,
                  path: "tag",
                },
              },
            }),
          );

          await insertUserPropertyAssignments([
            {
              workspaceId: workspace.id,
              userPropertyId: tagProperty.id,
              userId: "user-alpha",
              value: JSON.stringify("a"),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: tagProperty.id,
              userId: "user-beta",
              value: JSON.stringify("b"),
            },
            {
              workspaceId: workspace.id,
              userPropertyId: tagProperty.id,
              userId: "user-gamma",
              value: JSON.stringify("c"),
            },
          ]);

          const result = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              sortOrder: SortOrderEnum.Desc,
            }),
          );

          expect(result.users.map((u) => u.id)).toEqual([
            "user-gamma",
            "user-beta",
            "user-alpha",
          ]);
        });

        describe("sortOrder and direction combinations", () => {
          let levelProperty: UserProperty;
          const userLevels = [
            { userId: "user-01", level: 10 },
            { userId: "user-02", level: 20 },
            { userId: "user-03", level: 30 },
            { userId: "user-04", level: 40 },
            { userId: "user-05", level: 50 },
          ];

          beforeEach(async () => {
            levelProperty = unwrap(
              await insert({
                table: dbUserProperty,
                values: {
                  id: randomUUID(),
                  workspaceId: workspace.id,
                  name: "level",
                  updatedAt: new Date(),
                  definition: {
                    type: UserPropertyDefinitionType.Trait,
                    path: "level",
                  },
                },
              }),
            );

            await insertUserPropertyAssignments(
              userLevels.map(({ userId, level }) => ({
                workspaceId: workspace.id,
                userPropertyId: levelProperty.id,
                userId,
                value: JSON.stringify(level),
              })),
            );

            await upsertUserPropertyIndex({
              workspaceId: workspace.id,
              userPropertyId: levelProperty.id,
              type: "Number",
            });

            await sleep(250);
          });

          it("sortOrder=Asc + direction=After: paginates forward in ascending order", async () => {
            // Get first page
            const page1 = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Asc,
                direction: CursorDirectionEnum.After,
                limit: 2,
              }),
            );

            expect(page1.users.map((u) => u.id)).toEqual([
              "user-01",
              "user-02",
            ]);
            expect(
              page1.users.map((u) => u.properties[levelProperty.id]?.value),
            ).toEqual([10, 20]);
            expect(page1.nextCursor).toBeDefined();

            // Get second page
            const page2 = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Asc,
                direction: CursorDirectionEnum.After,
                cursor: page1.nextCursor,
                limit: 2,
              }),
            );

            expect(page2.users.map((u) => u.id)).toEqual([
              "user-03",
              "user-04",
            ]);
            expect(
              page2.users.map((u) => u.properties[levelProperty.id]?.value),
            ).toEqual([30, 40]);

            // Get third page
            const page3 = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Asc,
                direction: CursorDirectionEnum.After,
                cursor: page2.nextCursor,
                limit: 2,
              }),
            );

            expect(page3.users.map((u) => u.id)).toEqual(["user-05"]);
            expect(
              page3.users.map((u) => u.properties[levelProperty.id]?.value),
            ).toEqual([50]);
          });

          it("sortOrder=Asc + direction=Before: paginates backward in ascending order", async () => {
            // First get to page 2 to have a cursor to go back from
            const page1 = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Asc,
                limit: 2,
              }),
            );
            const page2 = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Asc,
                cursor: page1.nextCursor,
                limit: 2,
              }),
            );

            // Now paginate backward from page 2 using previousCursor
            // previousCursor points to first item of page 2 (user-03)
            const backPage = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Asc,
                direction: CursorDirectionEnum.Before,
                cursor: page2.previousCursor,
                limit: 2,
              }),
            );

            // Should get users at or before page 2's first item (cursor is inclusive for Before)
            // user-03 is at cursor position, user-02 is before it
            expect(backPage.users.map((u) => u.id)).toEqual([
              "user-02",
              "user-03",
            ]);
            expect(
              backPage.users.map((u) => u.properties[levelProperty.id]?.value),
            ).toEqual([20, 30]);
          });

          it("sortOrder=Desc + direction=After: paginates forward in descending order", async () => {
            // Get first page (descending: highest values first)
            const page1 = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Desc,
                direction: CursorDirectionEnum.After,
                limit: 2,
              }),
            );

            expect(page1.users.map((u) => u.id)).toEqual([
              "user-05",
              "user-04",
            ]);
            expect(
              page1.users.map((u) => u.properties[levelProperty.id]?.value),
            ).toEqual([50, 40]);
            expect(page1.nextCursor).toBeDefined();

            // Get second page
            const page2 = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Desc,
                direction: CursorDirectionEnum.After,
                cursor: page1.nextCursor,
                limit: 2,
              }),
            );

            expect(page2.users.map((u) => u.id)).toEqual([
              "user-03",
              "user-02",
            ]);
            expect(
              page2.users.map((u) => u.properties[levelProperty.id]?.value),
            ).toEqual([30, 20]);

            // Get third page
            const page3 = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Desc,
                direction: CursorDirectionEnum.After,
                cursor: page2.nextCursor,
                limit: 2,
              }),
            );

            expect(page3.users.map((u) => u.id)).toEqual(["user-01"]);
            expect(
              page3.users.map((u) => u.properties[levelProperty.id]?.value),
            ).toEqual([10]);
          });

          it("sortOrder=Desc + direction=Before: paginates backward in descending order", async () => {
            // First get to page 2 in descending order
            const page1 = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Desc,
                limit: 2,
              }),
            );
            const page2 = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Desc,
                cursor: page1.nextCursor,
                limit: 2,
              }),
            );

            // Now paginate backward from page 2 using previousCursor
            // previousCursor points to first item of page 2 (user-03)
            const backPage = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Desc,
                direction: CursorDirectionEnum.Before,
                cursor: page2.previousCursor,
                limit: 2,
              }),
            );

            // Should get users at or before page 2's first item (cursor is inclusive for Before)
            // In DESC order, user-04 comes before user-03, and user-03 is at cursor
            expect(backPage.users.map((u) => u.id)).toEqual([
              "user-04",
              "user-03",
            ]);
            expect(
              backPage.users.map((u) => u.properties[levelProperty.id]?.value),
            ).toEqual([40, 30]);
          });

          it("handles full round-trip pagination with sortOrder=Desc", async () => {
            // Page forward through all results in descending order
            const page1 = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Desc,
                limit: 3,
              }),
            );

            expect(page1.users.map((u) => u.id)).toEqual([
              "user-05",
              "user-04",
              "user-03",
            ]);

            const page2 = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Desc,
                cursor: page1.nextCursor,
                limit: 3,
              }),
            );

            expect(page2.users.map((u) => u.id)).toEqual([
              "user-02",
              "user-01",
            ]);

            // Now go back to page 1 using previousCursor
            // previousCursor points to first item of page 2 (user-02)
            const backToPage1 = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                sortBy: levelProperty.id,
                sortOrder: SortOrderEnum.Desc,
                direction: CursorDirectionEnum.Before,
                cursor: page2.previousCursor,
                limit: 3,
              }),
            );

            // Should see users at or before page 2's first item (user-02 at level 20)
            // Cursor is inclusive for Before, so includes user-02, and items before it in DESC order
            expect(backToPage1.users.map((u) => u.id)).toEqual([
              "user-04",
              "user-03",
              "user-02",
            ]);
          });
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

    describe("when a negativeSegmentFilter is passed", () => {
      let userIds: [string, string, string, string];
      let segmentId1: string;
      let segmentId2: string;

      beforeEach(async () => {
        userIds = ["user-in-seg", "user-out-seg", "user-no-seg", "user-in-seg2"];
        const segmentDefinition1: SegmentDefinition = {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: "1",
            path: "trait1",
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
            id: "2",
            path: "trait2",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "value2",
            },
          },
          nodes: [],
        };
        segmentId1 = randomUUID();
        segmentId2 = randomUUID();

        // Create an id user property so we have users in the system
        const idProperty = unwrap(
          await insert({
            table: dbUserProperty,
            values: {
              id: randomUUID(),
              workspaceId: workspace.id,
              name: "id",
              updatedAt: new Date(),
              definition: {
                type: UserPropertyDefinitionType.Id,
              },
            },
          }),
        );

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

        // Create user property assignments so users exist
        await insertUserPropertyAssignments(
          userIds.map((userId) => ({
            userPropertyId: idProperty.id,
            workspaceId: workspace.id,
            userId,
            value: JSON.stringify(userId),
          })),
        );

        // Set up segment assignments:
        // user-in-seg: IN segment1 (inSegment: true)
        // user-out-seg: OUT of segment1 (inSegment: false)
        // user-no-seg: NO segment assignment at all
        // user-in-seg2: IN segment2 (to test combination filters)
        await insertSegmentAssignments([
          {
            userId: userIds[0], // user-in-seg
            inSegment: true,
            segmentId: segmentId1,
            workspaceId: workspace.id,
          },
          {
            userId: userIds[1], // user-out-seg
            inSegment: false,
            segmentId: segmentId1,
            workspaceId: workspace.id,
          },
          // user-no-seg has no segment assignment
          {
            userId: userIds[3], // user-in-seg2
            inSegment: true,
            segmentId: segmentId2,
            workspaceId: workspace.id,
          },
        ]);
      });

      it("excludes users who are IN the segment", async () => {
        const result = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            negativeSegmentFilter: [segmentId1],
          }),
        );

        const resultUserIds = result.users.map((u) => u.id).sort();
        // user-in-seg should be EXCLUDED (they are in the segment)
        // user-out-seg should be INCLUDED (inSegment: false)
        // user-no-seg should be INCLUDED (no assignment = NULL)
        // user-in-seg2 should be INCLUDED (not related to segmentId1)
        expect(resultUserIds).toEqual([
          "user-in-seg2",
          "user-no-seg",
          "user-out-seg",
        ]);
      });

      it("includes users with inSegment: false", async () => {
        const result = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            negativeSegmentFilter: [segmentId1],
          }),
        );

        expect(result.users.map((u) => u.id)).toContain("user-out-seg");
      });

      it("includes users with no segment assignment (NULL)", async () => {
        const result = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            negativeSegmentFilter: [segmentId1],
          }),
        );

        expect(result.users.map((u) => u.id)).toContain("user-no-seg");
      });

      it("works with combination of positive and negative segment filters", async () => {
        // Add user-in-seg2 to segment1 as well
        await insertSegmentAssignments([
          {
            userId: userIds[3], // user-in-seg2
            inSegment: true,
            segmentId: segmentId1,
            workspaceId: workspace.id,
          },
        ]);

        const result = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            segmentFilter: [segmentId2], // must be IN segment2
            negativeSegmentFilter: [segmentId1], // must NOT be in segment1
          }),
        );

        // user-in-seg2 is in segment2 but now also in segment1, so excluded
        expect(result.users).toHaveLength(0);
      });

      it("works with positive segment filter selecting users not in negative filter", async () => {
        const result = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            segmentFilter: [segmentId2], // must be IN segment2
            negativeSegmentFilter: [segmentId1], // must NOT be in segment1
          }),
        );

        // user-in-seg2 is in segment2, and NOT in segment1
        expect(result.users.map((u) => u.id)).toEqual(["user-in-seg2"]);
      });
    });

    describe("when a negativeSubscriptionGroupFilter is passed", () => {
      let userId1: string;

      beforeEach(() => {
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

        describe("when a user has no segment assignment (default in group)", () => {
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
          it("the user is NOT included (they are in group by default)", async () => {
            const result = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                negativeSubscriptionGroupFilter: [subscriptionGroupId],
              }),
            );
            expect(result.users).toHaveLength(0);
          });
        });

        describe("when a user has explicitly opted in (inSegment: true)", () => {
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
          it("the user is NOT included (they are in the group)", async () => {
            const result = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                negativeSubscriptionGroupFilter: [subscriptionGroupId],
              }),
            );
            expect(result.users).toHaveLength(0);
          });
        });

        describe("when a user has opted out (inSegment: false)", () => {
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
          it("the user IS included (they unsubscribed, so NOT in group)", async () => {
            const result = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                negativeSubscriptionGroupFilter: [subscriptionGroupId],
              }),
            );
            expect(result.users).toHaveLength(1);
          });
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

        describe("when a user has no segment assignment (never opted in)", () => {
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
          it("the user IS included (never opted in means NOT in group)", async () => {
            const result = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                negativeSubscriptionGroupFilter: [subscriptionGroupId],
              }),
            );
            expect(result.users).toHaveLength(1);
          });
        });

        describe("when a user has opted in (inSegment: true)", () => {
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
          it("the user is NOT included (they opted in, so they ARE in group)", async () => {
            const result = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                negativeSubscriptionGroupFilter: [subscriptionGroupId],
              }),
            );
            expect(result.users).toHaveLength(0);
          });
        });

        describe("when a user has opted out (inSegment: false)", () => {
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
          it("the user IS included (they opted out, so NOT in group)", async () => {
            const result = unwrap(
              await getUsers({
                workspaceId: workspace.id,
                negativeSubscriptionGroupFilter: [subscriptionGroupId],
              }),
            );
            expect(result.users).toHaveLength(1);
          });
        });
      });

      describe("combination with subscriptionGroupFilter", () => {
        let subscriptionGroup1Id: string;
        let subscriptionGroup2Id: string;
        let userPropertyId: string;
        let segmentId1: string;
        let segmentId2: string;
        let userId2: string;

        beforeEach(async () => {
          subscriptionGroup1Id = randomUUID();
          subscriptionGroup2Id = randomUUID();
          userPropertyId = randomUUID();
          segmentId1 = randomUUID();
          segmentId2 = randomUUID();
          userId2 = randomUUID();

          await db()
            .insert(dbUserProperty)
            .values({
              id: userPropertyId,
              workspaceId: workspace.id,
              name: "id",
              updatedAt: new Date(),
              definition: {
                type: UserPropertyDefinitionType.Id,
              },
            });

          // Create two opt-in subscription groups
          await Promise.all([
            db().insert(dbSubscriptionGroup).values({
              id: subscriptionGroup1Id,
              workspaceId: workspace.id,
              name: "subscriptionGroup1",
              updatedAt: new Date(),
              type: SubscriptionGroupType.OptIn,
              channel: ChannelType.Email,
            }),
            db().insert(dbSubscriptionGroup).values({
              id: subscriptionGroup2Id,
              workspaceId: workspace.id,
              name: "subscriptionGroup2",
              updatedAt: new Date(),
              type: SubscriptionGroupType.OptIn,
              channel: ChannelType.Email,
            }),
          ]);

          await Promise.all([
            db()
              .insert(dbSegment)
              .values({
                id: segmentId1,
                workspaceId: workspace.id,
                name: "segment1",
                updatedAt: new Date(),
                subscriptionGroupId: subscriptionGroup1Id,
                definition: {
                  type: SegmentNodeType.SubscriptionGroup,
                  id: "1",
                  subscriptionGroupId: subscriptionGroup1Id,
                  subscriptionGroupType: SubscriptionGroupType.OptIn,
                } satisfies SubscriptionGroupSegmentNode,
              }),
            db()
              .insert(dbSegment)
              .values({
                id: segmentId2,
                workspaceId: workspace.id,
                name: "segment2",
                updatedAt: new Date(),
                subscriptionGroupId: subscriptionGroup2Id,
                definition: {
                  type: SegmentNodeType.SubscriptionGroup,
                  id: "2",
                  subscriptionGroupId: subscriptionGroup2Id,
                  subscriptionGroupType: SubscriptionGroupType.OptIn,
                } satisfies SubscriptionGroupSegmentNode,
              }),
          ]);

          // User1: in group1, NOT in group2
          // User2: in both groups
          await Promise.all([
            insertUserPropertyAssignments([
              {
                userPropertyId,
                userId: userId1,
                workspaceId: workspace.id,
                value: JSON.stringify(userId1),
              },
              {
                userPropertyId,
                userId: userId2,
                workspaceId: workspace.id,
                value: JSON.stringify(userId2),
              },
            ]),
            insertSegmentAssignments([
              {
                segmentId: segmentId1,
                userId: userId1,
                workspaceId: workspace.id,
                inSegment: true,
              },
              {
                segmentId: segmentId1,
                userId: userId2,
                workspaceId: workspace.id,
                inSegment: true,
              },
              {
                segmentId: segmentId2,
                userId: userId2,
                workspaceId: workspace.id,
                inSegment: true,
              },
            ]),
          ]);
        });

        it("returns users in group1 but NOT in group2", async () => {
          const result = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              subscriptionGroupFilter: [subscriptionGroup1Id],
              negativeSubscriptionGroupFilter: [subscriptionGroup2Id],
            }),
          );
          // User1 is in group1 and NOT in group2 -> included
          // User2 is in group1 and in group2 -> excluded
          expect(result.users).toHaveLength(1);
          expect(result.users[0]?.id).toBe(userId1);
        });
      });
    });

    describe("when an unsubscribedFromFilter is passed", () => {
      let userId1: string;
      let userPropertyId: string;
      let subscriptionGroupId: string;
      let unsubscribedSegmentId: string;

      beforeEach(async () => {
        userId1 = randomUUID();
        userPropertyId = randomUUID();
        subscriptionGroupId = randomUUID();

        // Create user property for id
        await db()
          .insert(dbUserProperty)
          .values({
            id: userPropertyId,
            workspaceId: workspace.id,
            name: "id",
            updatedAt: new Date(),
            definition: {
              type: UserPropertyDefinitionType.Id,
            },
          });

        // Create subscription group (this creates both main and unsubscribed segments)
        await upsertSubscriptionGroup({
          id: subscriptionGroupId,
          workspaceId: workspace.id,
          name: "TestSubscriptionGroup",
          type: SubscriptionGroupType.OptOut,
          channel: ChannelType.Email,
        });

        // Get the unsubscribed segment ID
        const unsubscribedSegmentName =
          getSubscriptionGroupUnsubscribedSegmentName(subscriptionGroupId);
        const segment = await db().query.segment.findFirst({
          where: (seg, { eq, and }) =>
            and(
              eq(seg.workspaceId, workspace.id),
              eq(seg.name, unsubscribedSegmentName),
            ),
        });
        if (!segment) {
          throw new Error("Unsubscribed segment not found");
        }
        unsubscribedSegmentId = segment.id;
      });

      describe("when a user has no unsubscribed segment assignment", () => {
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

        it("the user is NOT included (they haven't explicitly unsubscribed)", async () => {
          const result = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              unsubscribedFromFilter: [subscriptionGroupId],
            }),
          );
          expect(result.users).toHaveLength(0);
        });

        it("getUsersCount returns 0", async () => {
          const { userCount } = unwrap(
            await getUsersCount({
              workspaceId: workspace.id,
              unsubscribedFromFilter: [subscriptionGroupId],
            }),
          );
          expect(userCount).toBe(0);
        });
      });

      describe("when a user has explicitly unsubscribed (inSegment: true on unsubscribed segment)", () => {
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
                segmentId: unsubscribedSegmentId,
                userId: userId1,
                workspaceId: workspace.id,
                inSegment: true,
              },
            ]),
          ]);
        });

        it("the user IS included", async () => {
          const result = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              unsubscribedFromFilter: [subscriptionGroupId],
            }),
          );
          expect(result.users).toHaveLength(1);
          expect(result.users[0]?.id).toBe(userId1);
        });

        it("getUsersCount returns 1", async () => {
          const { userCount } = unwrap(
            await getUsersCount({
              workspaceId: workspace.id,
              unsubscribedFromFilter: [subscriptionGroupId],
            }),
          );
          expect(userCount).toBe(1);
        });
      });

      describe("when a user has inSegment: false on unsubscribed segment", () => {
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
                segmentId: unsubscribedSegmentId,
                userId: userId1,
                workspaceId: workspace.id,
                inSegment: false,
              },
            ]),
          ]);
        });

        it("the user is NOT included", async () => {
          const result = unwrap(
            await getUsers({
              workspaceId: workspace.id,
              unsubscribedFromFilter: [subscriptionGroupId],
            }),
          );
          expect(result.users).toHaveLength(0);
        });

        it("getUsersCount returns 0", async () => {
          const { userCount } = unwrap(
            await getUsersCount({
              workspaceId: workspace.id,
              unsubscribedFromFilter: [subscriptionGroupId],
            }),
          );
          expect(userCount).toBe(0);
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

    describe("when includeSubscriptions is true", () => {
      let userId1: string;
      let userId2: string;
      let subscriptionGroupId1: string;
      let subscriptionGroupId2: string;
      let userPropertyId: string;

      beforeEach(async () => {
        userId1 = randomUUID();
        userId2 = randomUUID();
        subscriptionGroupId1 = randomUUID();
        subscriptionGroupId2 = randomUUID();
        userPropertyId = randomUUID();

        // Create user property
        await db()
          .insert(dbUserProperty)
          .values({
            id: userPropertyId,
            workspaceId: workspace.id,
            name: "id",
            updatedAt: new Date(),
            definition: {
              type: UserPropertyDefinitionType.Id,
            },
          });

        // Create subscription groups
        await upsertSubscriptionGroup({
          id: subscriptionGroupId1,
          workspaceId: workspace.id,
          name: "Marketing Emails",
          type: SubscriptionGroupType.OptOut,
          channel: ChannelType.Email,
        });
        await upsertSubscriptionGroup({
          id: subscriptionGroupId2,
          workspaceId: workspace.id,
          name: "Product Updates",
          type: SubscriptionGroupType.OptIn,
          channel: ChannelType.Email,
        });

        // Create users with property assignments
        await insertUserPropertyAssignments([
          {
            userPropertyId,
            userId: userId1,
            workspaceId: workspace.id,
            value: JSON.stringify(userId1),
          },
          {
            userPropertyId,
            userId: userId2,
            workspaceId: workspace.id,
            value: JSON.stringify(userId2),
          },
        ]);

        // user1 opts out of marketing, user2 opts in to product updates
        await updateUserSubscriptions({
          workspaceId: workspace.id,
          userUpdates: [
            {
              userId: userId1,
              changes: {
                [subscriptionGroupId1]: false, // opt out of marketing
              },
            },
            {
              userId: userId2,
              changes: {
                [subscriptionGroupId2]: true, // opt in to product updates
              },
            },
          ],
        });
      });

      it("returns users with subscriptions array", async () => {
        const result = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            includeSubscriptions: true,
          }),
        );

        expect(result.users.length).toBeGreaterThanOrEqual(2);

        const user1: GetUsersResponseItem | undefined = result.users.find(
          (u) => u.id === userId1,
        );
        const user2: GetUsersResponseItem | undefined = result.users.find(
          (u) => u.id === userId2,
        );

        expect(user1).toBeDefined();
        expect(user2).toBeDefined();
        expect(user1?.subscriptions).toBeDefined();
        expect(user2?.subscriptions).toBeDefined();

        // user1 opted out of marketing (opt-out subscription), should be unsubscribed
        const user1MarketingSub: UserSubscriptionItem | undefined =
          user1?.subscriptions?.find((s) => s.id === subscriptionGroupId1);
        expect(user1MarketingSub).toEqual({
          id: subscriptionGroupId1,
          name: "Marketing Emails",
          subscribed: false,
        });

        // user2 opted in to product updates (opt-in subscription)
        const user2ProductSub: UserSubscriptionItem | undefined =
          user2?.subscriptions?.find((s) => s.id === subscriptionGroupId2);
        expect(user2ProductSub).toEqual({
          id: subscriptionGroupId2,
          name: "Product Updates",
          subscribed: true,
        });
      });

      it("does not include subscriptions when includeSubscriptions is false or not provided", async () => {
        const result = unwrap(
          await getUsers({
            workspaceId: workspace.id,
          }),
        );

        for (const user of result.users) {
          expect(user.subscriptions).toBeUndefined();
        }
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
