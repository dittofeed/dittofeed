import React from "react";
import { Updater, useImmer } from "use-immer";

export enum FilterStageType {
  ComputedPropertyType = "ComputedPropertyType",
  UserProperty = "UserProperty",
  UserPropertyValue = "UserPropertyValue",
  Segment = "Segment",
  SubscriptionGroup = "SubscriptionGroup",
}

export interface FilterComputedPropertyTypeStage {
  type: FilterStageType.ComputedPropertyType;
}

export interface FilterUserPropertyStage {
  type: FilterStageType.UserProperty;
}

export interface FilterUserPropertyValueStage {
  type: FilterStageType.UserPropertyValue;
  id: string;
  value: string;
}

export interface FilterSegmentStage {
  type: FilterStageType.Segment;
}

export interface FilterSubscriptionGroupStage {
  type: FilterStageType.SubscriptionGroup;
}

export type FilterStageWithBack =
  | FilterUserPropertyStage
  | FilterSegmentStage
  | FilterUserPropertyValueStage
  | FilterSubscriptionGroupStage;

export type FilterStage =
  | FilterUserPropertyStage
  | FilterUserPropertyValueStage
  | FilterSegmentStage
  | FilterSubscriptionGroupStage
  | FilterComputedPropertyTypeStage;

export interface UserFilterState {
  // map from user property id to user property value
  userProperties: Map<string, Set<string>>;
  // set of segment ids
  segments: Set<string>;
  staticSegments: Set<string>;
  // set of subscription group ids
  subscriptionGroups: Set<string>;
  staticSubscriptionGroups: Set<string>;
  stage: FilterStage | null;
}

export type UserFilterUpdater = Updater<UserFilterState>;

export type UserFilterHook = [UserFilterState, UserFilterUpdater];

/**
 * Create a memoized hash of user filter state for efficient caching and comparison
 *
 * @param state The user filter state
 * @returns A string hash representing the user filter state
 */
export function useUserFiltersHash(state: UserFilterState): string {
  return React.useMemo(
    () =>
      JSON.stringify(Array.from(state.userProperties.entries())) +
      JSON.stringify(Array.from(state.segments)),
    [state.userProperties, state.segments],
  );
}

export function useUserFilterState(
  initialState?: Partial<UserFilterState>,
): UserFilterHook {
  return useImmer<UserFilterState>({
    userProperties: initialState?.userProperties ?? new Map(),
    segments: initialState?.segments ?? new Set(),
    staticSegments: initialState?.staticSegments ?? new Set(),
    subscriptionGroups: initialState?.subscriptionGroups ?? new Set(),
    staticSubscriptionGroups:
      initialState?.staticSubscriptionGroups ?? new Set(),
    stage: initialState?.stage ?? null,
  });
}

export function addUserProperty(updater: Updater<UserFilterState>) {
  updater((state) => {
    if (state.stage?.type !== FilterStageType.UserPropertyValue) {
      return state;
    }
    const { id, value } = state.stage;
    const values = state.userProperties.get(id) ?? new Set();
    values.add(value);
    state.userProperties.set(id, values);
    return state;
  });
}

export function addSegment(updater: Updater<UserFilterState>, id: string) {
  updater((state) => {
    if (state.stage?.type !== FilterStageType.Segment) {
      return state;
    }
    if (state.staticSegments.has(id)) {
      return state;
    }
    state.segments.add(id);
    return state;
  });
}

export function removeUserProperty(
  updater: Updater<UserFilterState>,
  id: string,
) {
  updater((state) => {
    state.userProperties.delete(id);
    return state;
  });
}

export function removeSegment(updater: Updater<UserFilterState>, id: string) {
  updater((state) => {
    if (state.staticSegments.has(id)) {
      return state;
    }
    state.segments.delete(id);
    return state;
  });
}

export function setStage(
  updater: Updater<UserFilterState>,
  stage: FilterStage | null,
) {
  updater((state) => {
    state.stage = stage;
    return state;
  });
}

export function addSubscriptionGroup(
  updater: Updater<UserFilterState>,
  id: string,
) {
  updater((state) => {
    if (state.stage?.type !== FilterStageType.SubscriptionGroup) {
      return state;
    }
    state.subscriptionGroups.add(id);
    return state;
  });
}

export function removeSubscriptionGroup(
  updater: Updater<UserFilterState>,
  id: string,
) {
  updater((state) => {
    if (state.staticSubscriptionGroups.has(id)) {
      return state;
    }
    state.subscriptionGroups.delete(id);
    return state;
  });
}
