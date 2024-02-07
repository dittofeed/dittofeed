import {
  CompletionStatus,
  EphemeralRequestStatus,
  SegmentResource,
  UserPropertyResource,
} from "isomorphic-lib/src/types";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

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
  // Object stores available values for selected properties.
  // key = propertyId
  // value = { userId: propertyValue }
  propertiesValues: Record<string, Record<string, string>>;
  // String = propertyId
  // used to index propertiesValues
  selectedProperty: string;
  segments: Record<string, string>;
  selectedFilter: FilterOptions;
  userPropertyFilter: Record<
    string,
    {
      id: string;
      userIds?: string[];
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
  setSelectedProperty: (val: string) => void;
  setPropertiesValues: (val: Record<string, string>) => void;
  setSegmentFilter: (val: string) => void;
  setUserPropertyFilter: (val: string) => void;
  removePropertyFilter: (propertyId: string, userId?: string) => void;
  removeSegmentFilter: (segmentId: string) => void;
  setGetUserPropertiesRequest: (val: EphemeralRequestStatus<Error>) => void;
}

export const propertiesStore = create(
  immer<UserPropertiesState & UserPropertiesActions>((set) => ({
    properties: {},
    segments: {},
    selectedFilter: FilterOptions.NONE,
    selectedProperty: "",
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
          state.properties[property.id] = property.name;
        }
      }),
    setSegments: (segments) =>
      set((state) => {
        for (const segment of segments) {
          state.segments[segment.id] = segment.name;
        }
      }),
    setSelectedProperty: (property) =>
      set((state) => {
        state.selectedProperty = property;
      }),
    setPropertiesValues: (propertyValues) =>
      set((state) => {
        state.propertiesValues[state.selectedProperty] = propertyValues;
      }),
    setSegmentFilter: (selectedSegmentId) =>
      set((state) => {
        if (!state.segmentFilter.includes(selectedSegmentId)) {
          state.segmentFilter.push(selectedSegmentId);
        }
      }),
    setUserPropertyFilter: (selectedPropertyValue) =>
      set((state) => {
        if (state.userPropertyFilter[state.selectedProperty]) {
          state.userPropertyFilter[state.selectedProperty]?.userIds?.push(
            selectedPropertyValue,
          );
        } else {
          state.userPropertyFilter[state.selectedProperty] = {
            id: state.selectedProperty,
            userIds: [selectedPropertyValue],
          };
        }
      }),
    removePropertyFilter: (propertyId, userIdToDelete) =>
      set((state) => {
        if (
            // @ts-ignore
          !userIdToDelete || state.userPropertyFilter[propertyId]?.userIds?.length < 2
        ) {
          delete state.userPropertyFilter[propertyId];
        } else {
          (state.userPropertyFilter[propertyId] as any).userIds =
            state.userPropertyFilter[propertyId]?.userIds?.filter(
              (userId) => userId !== userIdToDelete,
            );
        }
      }),
    removeSegmentFilter: (segmentId) => 
      set((state) => {
          console.log(segmentId)
          state.segmentFilter = state.segmentFilter.filter((segment) =>  segment !== segmentId)
      })
  })),
);
