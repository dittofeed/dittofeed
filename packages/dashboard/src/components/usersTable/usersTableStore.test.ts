import { randomUUID } from "crypto";
import { insert } from "backend-lib/src/db";
import {
  userProperty as dbUserProperty,
  workspace as dbWorkspace,
} from "backend-lib/src/db/schema";
import { Workspace } from "backend-lib/src/types";
import { insertUserPropertyAssignments } from "backend-lib/src/userProperties";
import { getUsers, getUsersCount } from "backend-lib/src/users";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  CursorDirectionEnum,
  SortOrderEnum,
  UserPropertyDefinitionType,
} from "isomorphic-lib/src/types";

import { createUsersTableStore } from "./usersTableStore";

describe("usersTableStore", () => {
  let workspace: Workspace;
  let store: ReturnType<typeof createUsersTableStore>;

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
    store = createUsersTableStore();
  });

  describe("pagination state management", () => {
    describe("when there are multiple pages of users", () => {
      let userIds: string[];
      let firstNameProperty: { id: string };

      beforeEach(async () => {
        userIds = ["user-1", "user-2", "user-3", "user-4", "user-5"];
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
        await insertUserPropertyAssignments(
          userIds.map((userId, index) => ({
            userPropertyId: firstNameProperty.id,
            workspaceId: workspace.id,
            userId,
            value: JSON.stringify(`name-${index}`),
          })),
        );
      });

      it("correctly handles forward pagination (next page)", async () => {
        // Get first page
        const page1Response = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            limit: 2,
          }),
        );

        // Feed response to store
        store.getState().handleUsersResponse(page1Response);

        // Verify initial state
        expect(store.getState().currentPageUserIds).toHaveLength(2);
        expect(store.getState().nextCursor).toBeDefined();
        expect(store.getState().previousCursor).toBeNull();

        // Simulate clicking "Next"
        store.getState().goToNextPage();

        // Verify pagination state updated correctly
        expect(store.getState().cursor).toBe(page1Response.nextCursor);
        expect(store.getState().direction).toBe(CursorDirectionEnum.After);

        // Get second page using the store's state
        const page2Response = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            limit: 2,
            cursor: store.getState().cursor ?? undefined,
            direction: store.getState().direction ?? undefined,
          }),
        );

        store.getState().handleUsersResponse(page2Response);

        expect(store.getState().currentPageUserIds).toHaveLength(2);
        expect(store.getState().previousCursor).toBeDefined();
      });

      it("correctly handles backward pagination (previous page)", async () => {
        // Navigate to page 2 first
        const page1Response = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            limit: 2,
          }),
        );
        store.getState().handleUsersResponse(page1Response);

        const page2Response = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            limit: 2,
            cursor: page1Response.nextCursor,
            direction: CursorDirectionEnum.After,
          }),
        );
        store.getState().handleUsersResponse(page2Response);

        // Verify we have a previousCursor
        expect(store.getState().previousCursor).toBeDefined();

        // Simulate clicking "Previous"
        store.getState().goToPreviousPage();

        // Verify pagination state - should use previousCursor with Before direction
        expect(store.getState().cursor).toBe(page2Response.previousCursor);
        expect(store.getState().direction).toBe(CursorDirectionEnum.Before);

        // Get previous page using the store's state
        const backResponse = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            limit: 2,
            cursor: store.getState().cursor ?? undefined,
            direction: store.getState().direction ?? undefined,
          }),
        );

        store.getState().handleUsersResponse(backResponse);

        // Should be back at page with data
        expect(store.getState().currentPageUserIds.length).toBeGreaterThan(0);
      });

      it("correctly handles going to first page", async () => {
        // Navigate to page 2 first
        const page1Response = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            limit: 2,
          }),
        );
        store.getState().handleUsersResponse(page1Response);
        store.getState().goToNextPage();

        const page2Response = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            limit: 2,
            cursor: store.getState().cursor ?? undefined,
            direction: store.getState().direction ?? undefined,
          }),
        );
        store.getState().handleUsersResponse(page2Response);

        // Simulate clicking "First"
        store.getState().goToFirstPage();

        // Verify pagination state reset
        expect(store.getState().cursor).toBeNull();
        expect(store.getState().direction).toBeNull();
        expect(store.getState().nextCursor).toBeNull();
        expect(store.getState().previousCursor).toBeNull();
      });

      it("does not navigate when there is no next page", async () => {
        // Get last page (all users)
        const response = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            limit: 10, // More than total users
          }),
        );
        store.getState().handleUsersResponse(response);

        // nextCursor should be null when we have all results
        const initialCursor = store.getState().cursor;

        // Try to go to next page
        store.getState().goToNextPage();

        // Cursor should not have changed
        expect(store.getState().cursor).toBe(initialCursor);
      });

      it("does not navigate when there is no previous page", async () => {
        // Get first page
        const response = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            limit: 2,
          }),
        );
        store.getState().handleUsersResponse(response);

        // previousCursor should be null on first page
        expect(store.getState().previousCursor).toBeNull();

        const initialCursor = store.getState().cursor;

        // Try to go to previous page
        store.getState().goToPreviousPage();

        // Cursor should not have changed
        expect(store.getState().cursor).toBe(initialCursor);
      });
    });
  });

  describe("sort state management", () => {
    it("resets pagination when sort changes", async () => {
      // Set up some pagination state
      store.setState({
        cursor: "some-cursor",
        direction: CursorDirectionEnum.After,
        nextCursor: "next",
        previousCursor: "prev",
      });

      // Change sort
      store.getState().setSortBy("some-property-id");

      // Verify pagination was reset
      expect(store.getState().cursor).toBeNull();
      expect(store.getState().direction).toBeNull();
      expect(store.getState().nextCursor).toBeNull();
      expect(store.getState().previousCursor).toBeNull();
      expect(store.getState().sortBy).toBe("some-property-id");
    });

    it("resets pagination when sort order changes", async () => {
      // Set up some pagination state
      store.setState({
        cursor: "some-cursor",
        direction: CursorDirectionEnum.After,
        nextCursor: "next",
        previousCursor: "prev",
      });

      // Change sort order
      store.getState().setSortOrder(SortOrderEnum.Desc);

      // Verify pagination was reset
      expect(store.getState().cursor).toBeNull();
      expect(store.getState().direction).toBeNull();
      expect(store.getState().sortOrder).toBe(SortOrderEnum.Desc);
    });
  });

  describe("filter state management", () => {
    it("resets pagination when segments filter changes", () => {
      // Set up some pagination state
      store.setState({
        cursor: "some-cursor",
        direction: CursorDirectionEnum.After,
      });

      // Add a segment filter
      store.getState().addSegment("segment-1");

      // Verify pagination was reset
      expect(store.getState().cursor).toBeNull();
      expect(store.getState().direction).toBeNull();
      expect(store.getState().segments.has("segment-1")).toBe(true);
    });

    it("does not add static segments as dynamic filters", () => {
      store.getState().setStaticSegments(["static-segment"]);

      // Try to add a static segment as a dynamic filter
      store.getState().addSegment("static-segment");

      // The segment should be in segments (from static), but not removable
      expect(store.getState().segments.has("static-segment")).toBe(true);
      expect(store.getState().staticSegments.has("static-segment")).toBe(true);
    });

    it("cannot remove static segments", () => {
      store.getState().setStaticSegments(["static-segment"]);

      // Try to remove a static segment
      store.getState().removeSegment("static-segment");

      // Should still be there
      expect(store.getState().segments.has("static-segment")).toBe(true);
    });
  });

  describe("getQueryParams", () => {
    it("returns correct query params for API calls", () => {
      store.setState({
        cursor: "test-cursor",
        direction: CursorDirectionEnum.After,
        limit: 25,
        sortBy: "property-id",
        sortOrder: SortOrderEnum.Desc,
        segments: new Set(["segment-1"]),
        subscriptionGroups: new Set(["sg-1"]),
      });

      const params = store.getState().getQueryParams();

      expect(params).toEqual({
        cursor: "test-cursor",
        direction: CursorDirectionEnum.After,
        limit: 25,
        sortBy: "property-id",
        sortOrder: SortOrderEnum.Desc,
        segmentFilter: ["segment-1"],
        subscriptionGroupFilter: ["sg-1"],
        userPropertyFilter: undefined,
      });
    });

    it("omits undefined values correctly", () => {
      // Default state
      const params = store.getState().getQueryParams();

      expect(params.cursor).toBeUndefined();
      expect(params.direction).toBeUndefined();
      expect(params.sortBy).toBeUndefined();
      expect(params.segmentFilter).toBeUndefined();
      expect(params.subscriptionGroupFilter).toBeUndefined();
    });
  });

  describe("handleUsersResponse edge cases", () => {
    let firstNameProperty: { id: string };

    beforeEach(async () => {
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
          userId: "user-1",
          value: JSON.stringify("name-1"),
        },
        {
          userPropertyId: firstNameProperty.id,
          workspaceId: workspace.id,
          userId: "user-2",
          value: JSON.stringify("name-2"),
        },
      ]);
    });

    it("handles empty response when paginating forward past the end", async () => {
      // Get all users first
      const allUsersResponse = unwrap(
        await getUsers({
          workspaceId: workspace.id,
          limit: 10,
        }),
      );
      store.getState().handleUsersResponse(allUsersResponse);

      const userIdsBefore = store.getState().currentPageUserIds;

      // Simulate an empty response (as if we went past the end)
      store.setState({ direction: CursorDirectionEnum.After });
      store.getState().handleUsersResponse({
        users: [],
        userCount: 0,
      });

      // State should not have changed (stay on current page)
      expect(store.getState().currentPageUserIds).toEqual(userIdsBefore);
    });

    it("resets to first page when paginating backward with fewer results than limit", async () => {
      // Set up state as if we're on page 2 going backward
      store.setState({
        direction: CursorDirectionEnum.Before,
        limit: 10,
      });

      // Simulate a response with fewer results than limit (reached beginning)
      // Note: userCount in GetUsersResponse is always 0 (use getUsersCount for actual count)
      store.getState().handleUsersResponse({
        users: [
          {
            id: "user-1",
            segments: [],
            properties: {},
          },
        ],
        userCount: 0,
      });

      // Should reset to first page state
      expect(store.getState().cursor).toBeNull();
      expect(store.getState().direction).toBeNull();
      expect(store.getState().nextCursor).toBeNull();
      expect(store.getState().previousCursor).toBeNull();
    });
  });

  describe("integration: full pagination round trip", () => {
    let userIds: string[];
    let firstNameProperty: { id: string };

    beforeEach(async () => {
      userIds = ["user-a", "user-b", "user-c", "user-d"];
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
      await insertUserPropertyAssignments(
        userIds.map((userId, index) => ({
          userPropertyId: firstNameProperty.id,
          workspaceId: workspace.id,
          userId,
          value: JSON.stringify(`name-${index}`),
        })),
      );
    });

    it("can navigate forward and backward through pages correctly", async () => {
      const limit = 2;

      // Page 1
      const page1Response = unwrap(
        await getUsers({ workspaceId: workspace.id, limit }),
      );
      store.getState().handleUsersResponse(page1Response);

      const page1Users = store.getState().currentPageUserIds;
      expect(page1Users).toHaveLength(2);
      expect(store.getState().canGoPrevious()).toBe(false);
      expect(store.getState().canGoNext()).toBe(true);

      // Go to Page 2
      store.getState().goToNextPage();
      const page2Response = unwrap(
        await getUsers({
          workspaceId: workspace.id,
          limit,
          cursor: store.getState().cursor ?? undefined,
          direction: store.getState().direction ?? undefined,
        }),
      );
      store.getState().handleUsersResponse(page2Response);

      const page2Users = store.getState().currentPageUserIds;
      expect(page2Users).toHaveLength(2);
      expect(store.getState().canGoPrevious()).toBe(true);

      // Go back to Page 1
      store.getState().goToPreviousPage();
      const backToPage1Response = unwrap(
        await getUsers({
          workspaceId: workspace.id,
          limit,
          cursor: store.getState().cursor ?? undefined,
          direction: store.getState().direction ?? undefined,
        }),
      );
      store.getState().handleUsersResponse(backToPage1Response);

      // Should be back at first page users
      const backToPage1Users = store.getState().currentPageUserIds;
      expect(backToPage1Users).toHaveLength(2);
      // The users should match page 1 (or overlap with it)
      expect(
        backToPage1Users.some((id) => page1Users.includes(id)),
      ).toBe(true);
    });
  });

  describe("users count", () => {
    let userIds: string[];
    let firstNameProperty: { id: string };

    beforeEach(async () => {
      userIds = ["user-1", "user-2", "user-3"];
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
      await insertUserPropertyAssignments(
        userIds.map((userId, index) => ({
          userPropertyId: firstNameProperty.id,
          workspaceId: workspace.id,
          userId,
          value: JSON.stringify(`name-${index}`),
        })),
      );
    });

    it("can set and track users count", async () => {
      const countResponse = unwrap(
        await getUsersCount({
          workspaceId: workspace.id,
        }),
      );

      store.getState().setUsersCount(countResponse.userCount);

      expect(store.getState().usersCount).toBe(countResponse.userCount);
    });
  });
});

