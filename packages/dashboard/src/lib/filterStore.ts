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
  filter: string;
}

interface UserPropertyValueStage {
  type: FilterStageType.UserPropertyValue;
  id: string;
  value: string;
}

interface SegmentStage {
  type: FilterStageType.Segment;
  filter: string;
}

export type FilterStageWithBack =
  | UserPropertyStage
  | SegmentStage
  | UserPropertyValueStage;

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
        const { id, value } = state.stage;
        state.userProperties.set(id, value);
        state.stage = null;
        return state;
      });
    },
    addSegment: (id) => {
      set((state) => {
        if (state.stage?.type !== FilterStageType.Segment) {
          return state;
        }
        state.segments.add(id);
        state.stage = null;
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
