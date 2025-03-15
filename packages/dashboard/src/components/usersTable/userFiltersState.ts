import { Updater, useImmer } from "use-immer";

export enum FilterStageType {
  ComputedPropertyType = "ComputedPropertyType",
  UserProperty = "UserProperty",
  UserPropertyValue = "UserPropertyValue",
  Segment = "Segment",
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

export type FilterStageWithBack =
  | FilterUserPropertyStage
  | FilterSegmentStage
  | FilterUserPropertyValueStage;

export type FilterStage =
  | FilterUserPropertyStage
  | FilterUserPropertyValueStage
  | FilterSegmentStage
  | FilterComputedPropertyTypeStage;

interface UserFilterState {
  // map from user property id to user property value
  userProperties: Map<string, Set<string>>;
  staticUserProperties: Map<string, Set<string>>;
  // set of segment ids
  segments: Set<string>;
  staticSegments: Set<string>;
  stage: FilterStage | null;
}

export type UserFilterHook = [UserFilterState, Updater<UserFilterState>];

export function useUserFilterState(): UserFilterHook {
  return useImmer<UserFilterState>({
    userProperties: new Map(),
    staticUserProperties: new Map(),
    segments: new Set(),
    staticSegments: new Set(),
    stage: null,
  });
}

export function addUserProperty(updater: Updater<UserFilterState>) {
  updater((state) => {
    if (state.stage?.type !== FilterStageType.UserPropertyValue) {
      return state;
    }
    const { id, value } = state.stage;
    if (state.staticUserProperties.has(id)) {
      return state;
    }
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
    if (state.staticUserProperties.has(id)) {
      return state;
    }
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
