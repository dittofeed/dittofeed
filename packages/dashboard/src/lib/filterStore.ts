import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export enum FilterOptions {
  "USER_PROPERTY",
  "SEGMENTS",
  "NONE",
}

interface UserPropertiesState {
  selectedId: string;
  selectedFilter: FilterOptions;
  userPropertyFilter: Record<
    string,
    {
      id: string;
      partial?: string[];
    }
  >;
  segmentFilter: string[];
}

interface UserPropertiesActions {
  setSelectedFilter: (val: FilterOptions) => void;
  setSelectedId: (val: string) => void;
  setSegmentFilter: (val: string) => void;
  setUserPropertyFilter: (val: string, isPartialMatch?: boolean) => void;
  removePropertyFilter: (
    propertyId: string,
    userId?: string,
    isPartialMatch?: boolean,
  ) => void;
  removeSegmentFilter: (segmentId: string) => void;
}

export const filterStore = create(
  immer<UserPropertiesState & UserPropertiesActions>((set) => ({
    selectedFilter: FilterOptions.NONE,
    selectedId: "",
    propertiesValues: {},
    segmentFilter: [],
    userPropertyFilter: {},
    setSelectedFilter: (filterOption) =>
      set((state) => {
        state.selectedFilter = filterOption;
      }),
    setSelectedId: (property) =>
      set((state) => {
        state.selectedId = property;
      }),
    setSegmentFilter: (selectedSegmentId) =>
      set((state) => {
        if (!state.segmentFilter.includes(selectedSegmentId)) {
          state.segmentFilter.push(selectedSegmentId);
        }
      }),
    setUserPropertyFilter: (selectedPropertyValue) =>
      set((state) => {
        if (state.userPropertyFilter[state.selectedId]) {
          state.userPropertyFilter[state.selectedId]?.partial?.push(
            `${selectedPropertyValue.toLowerCase()}%`,
          );
        } else {
          state.userPropertyFilter[state.selectedId] = {
            id: state.selectedId,
            partial: [`${selectedPropertyValue.toLowerCase()}%`],
          };
        }
      }),
    removePropertyFilter: (propertyId, valueToDelete, isPartialMatch) =>
      set((state) => {
        const partialMatchesLength: number | undefined =
          state.userPropertyFilter[propertyId]?.partial?.length;

        if (!partialMatchesLength) return;

        // FIXME use map
        if (!valueToDelete) delete state.userPropertyFilter[propertyId];

        if (isPartialMatch) {
          if (partialMatchesLength < 2) {
            delete state.userPropertyFilter[propertyId];
          } else {
            (state.userPropertyFilter[propertyId] as any).partial =
              state.userPropertyFilter[propertyId]?.partial?.filter(
                (partialMatch) => partialMatch !== valueToDelete,
              );
          }
        }
      }),
    removeSegmentFilter: (segmentId) =>
      set((state) => {
        state.segmentFilter = state.segmentFilter.filter(
          (segment) => segment !== segmentId,
        );
      }),
  })),
);
