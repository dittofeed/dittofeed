import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export enum FilterOptions {
  UserProperty = "UserProperty",
  Segment = "Segment",
}

interface SelectedUserPropertyFilter {
  type: FilterOptions.UserProperty;
  id: string;
  value?: string;
}

interface SelectedSegmentFilter {
  type: FilterOptions.Segment;
  id: string;
}

type SelectedFilter = SelectedUserPropertyFilter | SelectedSegmentFilter;

interface UserFilterState {
  // map from user property id to user property value
  userProperties: Map<string, string>;
  // set of segment ids
  segments: Set<string>;
  selected: SelectedFilter | null;
}

interface UserFilterActions {
  addUserProperty: (propertyId: string, propertyValue: string) => void;
  removeUserProperty: (propertyId: string) => void;
  addSegment: (segmentId: string) => void;
  removeSegment: (segmentId: string) => void;
  setSelected: (selected: SelectedFilter) => void;
}

export const filterStore = create(
  immer<UserFilterState & UserFilterActions>((set) => ({
    userProperties: new Map(),
    segments: new Set(),
    selected: null,
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
        state.selected = selected;
      });
    },
  })),
);
