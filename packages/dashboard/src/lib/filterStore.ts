import {
  CompletionStatus,
  EphemeralRequestStatus,
  SegmentResource,
  UserPropertyResource,
} from "isomorphic-lib/src/types";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export function camelCaseToNormalText(camelCaseString: string) {
  // Split the camel case string into words
  const words = camelCaseString.replace(/([a-z])([A-Z])/g, "$1 $2").split(" ");

  // Capitalize each word
  const capitalizedWords = words.map((word: string) => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  });

  // Join the words to form the normal text
  const normalText = capitalizedWords.join(" ");

  return normalText;
}

export function filterIds(
  propertyValuesById: [string, string][],
  filterString: string,
): [string, string][] {
  return propertyValuesById.filter(([propertyValue]) =>
    propertyValue.toLowerCase().includes(filterString.toLowerCase()),
  );
}

export enum FilterOptions {
  "USER_PROPERTY",
  "SEGMENTS",
  "NONE",
}

interface UserPropertiesState {
  // Object stores a list of available properties where
  // key = propertyId
  // value = property_value
  // { uuid: "firstName" }
  properties: Record<string, string>;
  selectedId: string;
  segments: Record<string, string>;
  selectedFilter: FilterOptions;
  userPropertyFilter: Record<
    string,
    {
      id: string;
      partial?: string[];
    }
  >;
  segmentFilter: string[];
  getUserPropertiesRequest: EphemeralRequestStatus<Error>;
}

interface UserPropertiesActions {
  setProperties: (val: UserPropertyResource[]) => void;
  setSegments: (val: Pick<SegmentResource, "name" | "id">[]) => void;
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
  setGetUserPropertiesRequest: (val: EphemeralRequestStatus<Error>) => void;
}

export const filterStore = create(
  immer<UserPropertiesState & UserPropertiesActions>((set) => ({
    properties: {},
    segments: {},
    selectedFilter: FilterOptions.NONE,
    selectedId: "",
    propertiesValues: {},
    segmentFilter: [],
    userPropertyFilter: {},
    getUserPropertiesRequest: {
      type: CompletionStatus.NotStarted,
    },
    setSelectedFilter: (filterOption) =>
      set((state) => {
        state.selectedFilter = filterOption;
      }),
    setGetUserPropertiesRequest: (request) =>
      set((state) => {
        state.getUserPropertiesRequest = request;
      }),
    setProperties: (properties) =>
      set((state) => {
        for (const property of properties) {
          state.properties[property.id] = camelCaseToNormalText(property.name);
        }
      }),
    setSegments: (segments) =>
      set((state) => {
        for (const segment of segments) {
          state.segments[segment.id] = camelCaseToNormalText(segment.name);
        }
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
