import { GetUsersUserPropertyMatchType } from "isomorphic-lib/src/types";
import { pick } from "remeda";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

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
  match: GetUsersUserPropertyMatchType;
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

interface UserPropertyFilterEntry {
  match: GetUsersUserPropertyMatchType;
  values: Set<string>;
}

interface UserFilterState {
  userProperties: Map<string, UserPropertyFilterEntry>;
  // set of segment ids
  segments: Set<string>;
  stage: FilterStage | null;
}

interface UserFilterActions {
  addUserProperty: () => void;
  addSegment: (id: string) => void;
  removeUserProperty: (propertyId: string) => void;
  removeSegment: (segmentId: string) => void;
  setStage: (stage: FilterStage | null) => void;
}

export type FilterStoreContents = UserFilterState & UserFilterActions;

export const filterStore = create(
  immer<FilterStoreContents>((set) => ({
    userProperties: new Map(),
    segments: new Set(),
    stage: null,
    addUserProperty: () => {
      set((state) => {
        if (state.stage?.type !== FilterStageType.UserPropertyValue) {
          return state;
        }
        const { id, value, match } = state.stage;
        const existing = state.userProperties.get(id);
        if (existing) {
          existing.values.add(value);
        } else {
          state.userProperties.set(id, {
            match,
            values: new Set([value]),
          });
        }
        return state;
      });
    },
    addSegment: (id) => {
      set((state) => {
        if (state.stage?.type !== FilterStageType.Segment) {
          return state;
        }
        state.segments.add(id);
        return state;
      });
    },
    removeUserProperty: (propertyId) => {
      set((state) => {
        state.userProperties.delete(propertyId);
      });
    },
    removeSegment: (segmentId) => {
      set((state) => {
        state.segments.delete(segmentId);
      });
    },
    setStage: (stage) => {
      set((state) => {
        state.stage = stage;
      });
    },
  })),
);

export function filterStorePick<K extends keyof FilterStoreContents>(
  params: K[],
): Pick<FilterStoreContents, K> {
  return filterStore((store) => pick(store, params));
}
