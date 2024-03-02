import { pick } from "remeda/dist/commonjs/pick";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export enum FilterStageType {
  ComputedPropertyType = "ComputedPropertyType",
  UserProperty = "UserProperty",
  UserPropertyValue = "UserPropertyValue",
  Segment = "Segment",
}

interface ComputedPropertyTypeStage {
  type: FilterStageType.ComputedPropertyType;
}

interface UserPropertyStage {
  type: FilterStageType.UserProperty;
  id: string;
}

interface UserPropertyValueStage {
  type: FilterStageType.UserPropertyValue;
  id: string;
  value: string;
}

interface SegmentStage {
  type: FilterStageType.Segment;
  id: string;
}

export type FilterStage =
  | UserPropertyStage
  | UserPropertyValueStage
  | SegmentStage
  | ComputedPropertyTypeStage;

interface UserFilterState {
  // map from user property id to user property value
  userProperties: Map<string, string>;
  // set of segment ids
  segments: Set<string>;
  stage: FilterStage | null;
}

interface UserFilterActions {
  addUserProperty: (propertyId: string, propertyValue: string) => void;
  addSegment: (segmentId: string) => void;
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
    addUserProperty: (propertyId, propertyValue) => {
      set((state) => {
        state.userProperties.set(propertyId, propertyValue);
        state.stage = null;
      });
    },
    addSegment: (segmentId) => {
      set((state) => {
        state.segments.add(segmentId);
        state.stage = null;
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
