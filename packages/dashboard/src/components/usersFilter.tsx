import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import { Box } from "@mui/material";
import React, { useMemo } from "react";
import { CompletionStatus, EphemeralRequestStatus, GetUserPropertiesResponse, SegmentResource, UserPropertyResource } from "isomorphic-lib/src/types";
import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import FilterSelect from "./usersFilterSelector";

export enum FilterOptions {
    "USER_PROPERTY",
    "SEGMENTS",
    "NONE"
}
interface UserPropertiesState {
    // Object stores a list of available properties where
    // key = propertyId 
    // value = property_value
    // { uuid: "firstName" }
    properties: Record<string, string>, 
    // Object stores available values for selected properties.
    // key = propertyId 
    // value = { userId: propertyValue }
    propertiesValues: {[key: string]: Record<string,string>},
    // String = propertyId
    // used to index propertiesValues
    selectedProperty: string,
    segments: Record<string,string>,
    selectedFilter: FilterOptions,
    userPropertyFilter: {
        [key: string]: {
            id: string,
            userIds?: string[],
            partial?: string[]
        }
    },
    segmentFilter: string[],
    getUserPropertiesRequest: EphemeralRequestStatus<Error>
}

interface UserPropertiesActions {
    setProperties: (val: UserPropertyResource[]) => void;
    setSegments: (val: Pick<SegmentResource, 'name' | 'id'>[]) => void;
    setSelectedFilter: (val: FilterOptions) => void;
    setSelectedProperty: (val: string) => void;
    setPropertiesValues: (val: Record<string,string>) => void;
    setSegmentFilter: (val: string) => void;
    setUserPropertyFilter: (val: string) => void;
    removeFilter: (propertyId: string, userId?: string) => void;
    setGetUserPropertiesRequest: (val: EphemeralRequestStatus<Error>) => void;
}

export const propertiesStore = create(
    immer<UserPropertiesState & UserPropertiesActions>((set) => ({
        properties: {},
        segments: {},
        selectedFilter: FilterOptions.NONE,
        selectedProperty: '',
        propertiesValues: {},
        segmentFilter: [],
        userPropertyFilter: {},
        getUserPropertiesRequest: {
            type: CompletionStatus.NotStarted,
        },
        setSelectedFilter: (filterOption) =>
          set((state) => {
            state.selectedFilter = filterOption
          }),
        setGetUserPropertiesRequest: (request) =>
          set((state) => {
            state.getUserPropertiesRequest = request;
          }),
        setProperties: (properties) => 
          set((state) => {
              for (const property of properties) {
                  state.properties[property.id] = property.name;
          }}),
        setSegments: (segments) => 
          set((state) => {
              for (const segment of segments) {
                  state.segments[segment.id] = segment.name
              }
          }),
        setSelectedProperty: (property) =>
            set((state) => {
                state.selectedProperty = property
            }),
        setPropertiesValues: (propertyValues) => 
            set((state) => {
                state.propertiesValues[state.selectedProperty] = propertyValues
            }),
        setSegmentFilter: (selectedSegmentId) => 
            set((state) => {
                if (!state.segmentFilter.includes(selectedSegmentId)) {
                    state.segmentFilter.push(selectedSegmentId)
                }
            }),
        setUserPropertyFilter: (selectedPropertyValue) => 
            set((state) => {
                if (state.userPropertyFilter[state.selectedProperty]) {
                    state.userPropertyFilter[state.selectedProperty]?.userIds?.push(selectedPropertyValue)
                }else {
                    state.userPropertyFilter[state.selectedProperty] = {
                        id: state.selectedProperty,
                        userIds: [selectedPropertyValue]
                    } 
                }
            }),
        removeFilter: (propertyId, userIdToDelete) => 
            set((state) => {
                if (!userIdToDelete || (state.userPropertyFilter[propertyId]?.userIds?.length as number) < 2){
                    delete state.userPropertyFilter[propertyId]
                } else {
                    (state.userPropertyFilter[propertyId] as any).userIds = state.userPropertyFilter[propertyId]?.userIds?.filter(userId => userId !== userIdToDelete)
                }
            })
    })
))

export const UsersFilter = ({
    workspaceId,
}: {
    workspaceId: string,
}) => {
  const userPropertyFilterFromStore = propertiesStore((store) => store.userPropertyFilter)
  const removeFilter = propertiesStore((store) => store.removeFilter)
  const userPropertyFilter = useMemo(() => Object.values(userPropertyFilterFromStore), [userPropertyFilterFromStore])
  const segmentFilterFromStore = propertiesStore((store) => store.segmentFilter)
  const segmentFilter = useMemo(() => segmentFilterFromStore, [segmentFilterFromStore])
  const properties = propertiesStore((store) => store.properties)
  const segments = propertiesStore((store) => store.segments)
  const propertiesValues = propertiesStore((store) => store.propertiesValues)
  const getUserPropertiesRequest = propertiesStore((store) => store.getUserPropertiesRequest);
  const setGetUserPropertiesRequest = propertiesStore((store) => store.setGetUserPropertiesRequest);
  const setSegments = propertiesStore((store) => store.setSegments);
  const setProperties = propertiesStore((store) => store.setProperties);
  
  const apiBase = useAppStore((store) => store.apiBase);


  React.useEffect(() => {
    const setLoadResponse = (response: GetUserPropertiesResponse) => {
        setProperties(response.properties);
        setSegments(response.segments);
    };

    const handler = apiRequestHandlerFactory({
      request: getUserPropertiesRequest,
      setRequest: setGetUserPropertiesRequest,
      responseSchema: GetUserPropertiesResponse,
      setResponse: setLoadResponse,
      requestConfig: {
        method: "GET",
        url: `${apiBase}/api/user-properties`,
        params: {
           workspaceId: workspaceId 
        },
        headers: {
          "Content-Type": "application/json",
        },
      },
    });
    handler();
  }, [])

  return (
    <Stack spacing={2} direction="row" justifyItems="center" alignItems="center">
        { userPropertyFilter.map((property, index) => 
            <Box display="flex" flexDirection="row" bgcolor="grey.300" color="text.primary" paddingY="5px" paddingX="8px" key={index}>
                <CloseOutlinedIcon sx={{width: 10, mr: 1}} color="secondary" onClick={() => removeFilter(property.id)}/>
                <Breadcrumbs aria-label="breadcrumb" separator=">" id="hello">
                    <Typography color="inherit">
                     User Property
                    </Typography>
                    <Typography color="inherit">
                     {properties[property.id]}
                    </Typography>
                    {property.userIds && property.userIds.map((userId, key) => 
                        <Typography color="inherit" key={key} onClick={() => removeFilter(property.id, userId)}>
                          {(propertiesValues[property.id] as Record<string,string>)[userId]} 
                        </Typography>
                    )}
                </Breadcrumbs>
            </Box>
         )} 
         { segmentFilter.map((property, index) => 
            <Stack>
                <Box display="flex" flexDirection="row" bgcolor="grey.300" color="text.primary" paddingY="5px" paddingX="8px" key={index}>
                    <CloseOutlinedIcon sx={{width: 10, mr: 1}} color="secondary" onClick={() => removeFilter(property)}/>
                    <Breadcrumbs aria-label="breadcrumb" separator=">" id="hello">
                        <Typography color="inherit">
                         Segment
                        </Typography>
                        <Typography color="inherit">
                         {segments[property]}
                        </Typography>
                    </Breadcrumbs>
                </Box>
            </Stack>
         )} 
        <FilterSelect workspaceId={workspaceId}/>
    </Stack>
  );
}

