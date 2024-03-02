import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export enum FilterStages {
  ComputedPropertyType = "ComputedPropertyType",
  UserProperty = "UserProperty",
  UserPropertyValue = "UserPropertyValue",
  Segment = "Segment",
}

interface ComputedPropertyTypeStage {
  type: FilterStages.ComputedPropertyType;
}

interface UserPropertyStage {
  type: FilterStages.UserProperty;
  id: string;
}

interface UserPropertyValueStage {
  type: FilterStages.UserProperty;
  id: string;
  value: string;
}

interface SegmentStage {
  type: FilterStages.Segment;
  id: string;
}

type Stage =
  | UserPropertyStage
  | UserPropertyValueStage
  | SegmentStage
  | ComputedPropertyTypeStage;

interface UserFilterState {
  // map from user property id to user property value
  userProperties: Map<string, string>;
  // set of segment ids
  segments: Set<string>;
  Stage: Stage | null;
}

interface UserFilterActions {
  addUserProperty: (propertyId: string, propertyValue: string) => void;
  removeUserProperty: (propertyId: string) => void;
  addSegment: (segmentId: string) => void;
  removeSegment: (segmentId: string) => void;
  setSelected: (selected: Stage) => void;
}

export const filterStore = create(
  immer<UserFilterState & UserFilterActions>((set) => ({
    userProperties: new Map(),
    segments: new Set(),
    Stage: null,
    addUserProperty: (propertyId, propertyValue) => {
      set((state) => {
        state.userProperties.set(propertyId, propertyValue);
      });
    },
    removeUserProperty: (propertyId) => {
      set((state) => {
        state.userProperties.delete(propertyId);
      });
    },
    addSegment: (segmentId) => {
      set((state) => {
        state.segments.add(segmentId);
      });
    },
    removeSegment: (segmentId) => {
      set((state) => {
        state.segments.delete(segmentId);
      });
    },
    setSelected: (selected) => {
      set((state) => {
        state.Stage = selected;
      });
    },
  })),
);
