import {
  CursorDirectionEnum,
  GetUsersRequest,
  GetUsersResponse,
  GetUsersResponseItem,
  GetUsersUserPropertyFilter,
  SortOrderEnum,
} from "isomorphic-lib/src/types";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { createStoreContext } from "../../lib/createStoreContext";

// ============================================================================
// Types
// ============================================================================

export interface UserFilterState {
  /** Map from user property id to set of property values */
  userProperties: Map<string, Set<string>>;
  /** Set of segment ids to filter by */
  segments: Set<string>;
  /** Segment ids that are fixed and cannot be removed by the user */
  staticSegments: Set<string>;
  /** Set of subscription group ids to filter by */
  subscriptionGroups: Set<string>;
  /** Subscription group ids that are fixed and cannot be removed by the user */
  staticSubscriptionGroups: Set<string>;
  /** Set of segment ids to exclude users from (negative filter) */
  negativeSegments: Set<string>;
}

export interface PaginationState {
  /** Current cursor value being used for the query */
  cursor: string | null;
  /** Direction of pagination (After = forward, Before = backward) */
  direction: CursorDirectionEnum | null;
  /** Number of items per page */
  limit: number;
}

export interface SortState {
  /** User property ID to sort by, or null for default sort */
  sortBy: string | null;
  /** Sort order (ascending or descending) */
  sortOrder: SortOrderEnum;
}

export interface UsersDataState {
  /** Map of user ID to user data, acts as a cache */
  users: Record<string, GetUsersResponseItem>;
  /** User IDs for the currently displayed page */
  currentPageUserIds: string[];
  /** Total count of users matching the current filters */
  usersCount: number | null;
  /** Cursor for the next page, null if no more pages */
  nextCursor: string | null;
  /** Cursor for the previous page, null if on first page */
  previousCursor: string | null;
}

export interface UsersTableState
  extends UserFilterState,
    PaginationState,
    SortState,
    UsersDataState {
  /** Whether auto-reload is enabled */
  autoReload: boolean;
}

export interface UsersTableActions {
  // Pagination actions
  goToNextPage: () => void;
  goToPreviousPage: () => void;
  goToFirstPage: () => void;

  // Sort actions
  setSortBy: (sortBy: string | null) => void;
  setSortOrder: (sortOrder: SortOrderEnum) => void;

  // Filter actions
  setStaticSegments: (segmentIds: string[]) => void;
  setStaticSubscriptionGroups: (subscriptionGroupIds: string[]) => void;
  addSegment: (segmentId: string) => void;
  removeSegment: (segmentId: string) => void;
  addSubscriptionGroup: (subscriptionGroupId: string) => void;
  removeSubscriptionGroup: (subscriptionGroupId: string) => void;
  addUserPropertyFilter: (propertyId: string, value: string) => void;
  removeUserPropertyFilter: (propertyId: string) => void;

  // Data actions
  handleUsersResponse: (response: GetUsersResponse) => void;
  setUsersCount: (count: number) => void;

  // Settings actions
  toggleAutoReload: () => void;

  // Utility getters
  getQueryParams: () => Omit<GetUsersRequest, "workspaceId">;
  getFilterParams: () => Omit<
    GetUsersRequest,
    "workspaceId" | "cursor" | "limit" | "direction"
  >;

  // State checks
  canGoNext: () => boolean;
  canGoPrevious: () => boolean;
}

export type UsersTableStore = UsersTableState & UsersTableActions;

// ============================================================================
// Initial State
// ============================================================================

export interface UsersTableStoreInitialState {
  /** Initial segment IDs to filter by (static, cannot be removed) */
  staticSegmentIds?: string[];
  /** Initial subscription group IDs to filter by (static, cannot be removed) */
  staticSubscriptionGroupIds?: string[];
  /** Initial negative segment IDs (users NOT in these segments) */
  negativeSegmentIds?: string[];
  /** Initial cursor for pagination */
  cursor?: string;
  /** Initial pagination direction */
  direction?: CursorDirectionEnum;
  /** Initial sort property */
  sortBy?: string;
  /** Initial sort order */
  sortOrder?: SortOrderEnum;
  /** Number of items per page */
  limit?: number;
  /** Whether auto-reload is enabled by default */
  autoReloadByDefault?: boolean;
}

function getInitialState(
  initialState?: UsersTableStoreInitialState,
): UsersTableState {
  const staticSegments = new Set(initialState?.staticSegmentIds ?? []);
  const staticSubscriptionGroups = new Set(
    initialState?.staticSubscriptionGroupIds ?? [],
  );
  const negativeSegments = new Set(initialState?.negativeSegmentIds ?? []);

  return {
    // Filter state
    userProperties: new Map(),
    segments: new Set(staticSegments),
    staticSegments,
    subscriptionGroups: new Set(staticSubscriptionGroups),
    staticSubscriptionGroups,
    negativeSegments,

    // Pagination state
    cursor: initialState?.cursor ?? null,
    direction: initialState?.direction ?? null,
    limit: initialState?.limit ?? 10,

    // Sort state
    sortBy: initialState?.sortBy ?? null,
    sortOrder: initialState?.sortOrder ?? SortOrderEnum.Asc,

    // Data state
    users: {},
    currentPageUserIds: [],
    usersCount: null,
    nextCursor: null,
    previousCursor: null,

    // Settings
    autoReload: initialState?.autoReloadByDefault ?? false,
  };
}

// ============================================================================
// Store Factory
// ============================================================================

export function createUsersTableStore(
  initialState?: UsersTableStoreInitialState,
) {
  return create<UsersTableStore>()(
    immer((set, get) => ({
      ...getInitialState(initialState),

      // ========================================================================
      // Pagination Actions
      // ========================================================================

      goToNextPage: () => {
        const { nextCursor } = get();
        if (!nextCursor) return;

        set((state) => {
          state.cursor = nextCursor;
          state.direction = CursorDirectionEnum.After;
        });
      },

      goToPreviousPage: () => {
        const { previousCursor } = get();
        if (!previousCursor) return;

        set((state) => {
          state.cursor = previousCursor;
          state.direction = CursorDirectionEnum.Before;
        });
      },

      goToFirstPage: () => {
        set((state) => {
          state.cursor = null;
          state.direction = null;
          state.nextCursor = null;
          state.previousCursor = null;
        });
      },

      // ========================================================================
      // Sort Actions
      // ========================================================================

      setSortBy: (sortBy) => {
        set((state) => {
          state.sortBy = sortBy;
          // Reset pagination when sort changes
          state.cursor = null;
          state.direction = null;
          state.nextCursor = null;
          state.previousCursor = null;
        });
      },

      setSortOrder: (sortOrder) => {
        set((state) => {
          state.sortOrder = sortOrder;
          // Reset pagination when sort order changes
          state.cursor = null;
          state.direction = null;
          state.nextCursor = null;
          state.previousCursor = null;
        });
      },

      // ========================================================================
      // Filter Actions
      // ========================================================================

      setStaticSegments: (segmentIds) => {
        set((state) => {
          // Remove old static segments
          for (const segmentId of state.staticSegments) {
            state.segments.delete(segmentId);
          }
          // Add new static segments
          state.staticSegments = new Set(segmentIds);
          for (const segmentId of segmentIds) {
            state.segments.add(segmentId);
          }
          // Reset pagination when filters change
          state.cursor = null;
          state.direction = null;
        });
      },

      setStaticSubscriptionGroups: (subscriptionGroupIds) => {
        set((state) => {
          // Remove old static subscription groups
          for (const sgId of state.staticSubscriptionGroups) {
            state.subscriptionGroups.delete(sgId);
          }
          // Add new static subscription groups
          state.staticSubscriptionGroups = new Set(subscriptionGroupIds);
          for (const sgId of subscriptionGroupIds) {
            state.subscriptionGroups.add(sgId);
          }
          // Reset pagination when filters change
          state.cursor = null;
          state.direction = null;
        });
      },

      addSegment: (segmentId) => {
        set((state) => {
          if (!state.staticSegments.has(segmentId)) {
            state.segments.add(segmentId);
            // Reset pagination when filters change
            state.cursor = null;
            state.direction = null;
          }
        });
      },

      removeSegment: (segmentId) => {
        set((state) => {
          if (!state.staticSegments.has(segmentId)) {
            state.segments.delete(segmentId);
            // Reset pagination when filters change
            state.cursor = null;
            state.direction = null;
          }
        });
      },

      addSubscriptionGroup: (subscriptionGroupId) => {
        set((state) => {
          if (!state.staticSubscriptionGroups.has(subscriptionGroupId)) {
            state.subscriptionGroups.add(subscriptionGroupId);
            // Reset pagination when filters change
            state.cursor = null;
            state.direction = null;
          }
        });
      },

      removeSubscriptionGroup: (subscriptionGroupId) => {
        set((state) => {
          if (!state.staticSubscriptionGroups.has(subscriptionGroupId)) {
            state.subscriptionGroups.delete(subscriptionGroupId);
            // Reset pagination when filters change
            state.cursor = null;
            state.direction = null;
          }
        });
      },

      addUserPropertyFilter: (propertyId, value) => {
        set((state) => {
          const values = state.userProperties.get(propertyId) ?? new Set();
          values.add(value);
          state.userProperties.set(propertyId, values);
          // Reset pagination when filters change
          state.cursor = null;
          state.direction = null;
        });
      },

      removeUserPropertyFilter: (propertyId) => {
        set((state) => {
          state.userProperties.delete(propertyId);
          // Reset pagination when filters change
          state.cursor = null;
          state.direction = null;
        });
      },

      // ========================================================================
      // Data Actions
      // ========================================================================

      handleUsersResponse: (response) => {
        const { limit, direction } = get();

        set((state) => {
          // Handle edge case: navigating before with fewer results than limit
          // This means we've reached the beginning, so reset pagination state
          // but still show the results we received
          if (
            response.users.length < limit &&
            direction === CursorDirectionEnum.Before
          ) {
            state.cursor = null;
            state.direction = null;
            state.nextCursor = null;
            state.previousCursor = null;
            // Still update users with the data we received
            if (response.users.length > 0) {
              const newUsersMap: Record<string, GetUsersResponseItem> = {};
              for (const user of response.users) {
                newUsersMap[user.id] = user;
              }
              state.users = newUsersMap;
              state.currentPageUserIds = response.users.map((u) => u.id);
            }
            return;
          }

          // Handle edge case: navigating after with no results
          // This means we've gone past the end, don't update state
          if (
            response.users.length === 0 &&
            direction === CursorDirectionEnum.After
          ) {
            // Don't update state - stay on current page
            return;
          }

          // Normal case: update with new data
          const newUsersMap: Record<string, GetUsersResponseItem> = {};
          for (const user of response.users) {
            newUsersMap[user.id] = user;
          }

          state.users = newUsersMap;
          state.currentPageUserIds = response.users.map((u) => u.id);
          state.nextCursor = response.nextCursor ?? null;
          state.previousCursor = response.previousCursor ?? null;
        });
      },

      setUsersCount: (count) => {
        set((state) => {
          state.usersCount = count;
        });
      },

      // ========================================================================
      // Settings Actions
      // ========================================================================

      toggleAutoReload: () => {
        set((state) => {
          state.autoReload = !state.autoReload;
        });
      },

      // ========================================================================
      // Utility Getters
      // ========================================================================

      getQueryParams: () => {
        const {
          cursor,
          direction,
          limit,
          sortBy,
          sortOrder,
          segments,
          subscriptionGroups,
          userProperties,
          negativeSegments,
        } = get();

        const userPropertyFilter: GetUsersUserPropertyFilter | undefined =
          userProperties.size > 0
            ? Array.from(userProperties).map(([id, values]) => ({
                id,
                values: Array.from(values),
              }))
            : undefined;

        return {
          cursor: cursor ?? undefined,
          direction: direction ?? undefined,
          limit,
          sortBy: sortBy ?? undefined,
          sortOrder,
          segmentFilter: segments.size > 0 ? Array.from(segments) : undefined,
          negativeSegmentFilter:
            negativeSegments.size > 0
              ? Array.from(negativeSegments)
              : undefined,
          subscriptionGroupFilter:
            subscriptionGroups.size > 0
              ? Array.from(subscriptionGroups)
              : undefined,
          userPropertyFilter,
          // Always use exclusive cursor for correct back-navigation behavior
          exclusiveCursor: true,
        };
      },

      getFilterParams: () => {
        const { segments, subscriptionGroups, userProperties, negativeSegments } = get();

        const userPropertyFilter: GetUsersUserPropertyFilter | undefined =
          userProperties.size > 0
            ? Array.from(userProperties).map(([id, values]) => ({
                id,
                values: Array.from(values),
              }))
            : undefined;

        return {
          segmentFilter: segments.size > 0 ? Array.from(segments) : undefined,
          negativeSegmentFilter:
            negativeSegments.size > 0
              ? Array.from(negativeSegments)
              : undefined,
          subscriptionGroupFilter:
            subscriptionGroups.size > 0
              ? Array.from(subscriptionGroups)
              : undefined,
          userPropertyFilter,
        };
      },

      // ========================================================================
      // State Checks
      // ========================================================================

      canGoNext: () => {
        return get().nextCursor !== null;
      },

      canGoPrevious: () => {
        return get().previousCursor !== null;
      },
    })),
  );
}

// ============================================================================
// Context Provider and Hook
// ============================================================================

// Factory function that captures initial state
export function createUsersTableStoreFactory(
  initialState?: UsersTableStoreInitialState,
) {
  return () => createUsersTableStore(initialState);
}

// Create context with a default factory (can be overridden per instance)
const [UsersTableStoreProvider, useUsersTableStore, useUsersTableStoreApi] =
  createStoreContext(createUsersTableStore);

export { UsersTableStoreProvider, useUsersTableStore, useUsersTableStoreApi };
