import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import { Box } from "@mui/material";
import React, { useMemo } from "react";
import { CompletionStatus, EphemeralRequestStatus, GetUserPropertiesResponse, UserPropertyResource } from "isomorphic-lib/src/types";
import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import FilterSelector from "./usersFilterSelector";
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';

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
    selectedFilter: FilterOptions,
    filter: {
        [key: string]: {
            id: string,
            userIds?: string[],
            partial?: string[]
        }
    },
    getUserPropertiesRequest: EphemeralRequestStatus<Error>
}

interface UserPropertiesActions {
    setProperties: (val: UserPropertyResource[]) => void;
    setSelectedFilter: (val: FilterOptions) => void;
    setSelectedProperty: (val: string) => void;
    setPropertiesValues: (val: Record<string,string>) => void;
    setFilter: (val: string) => void;
    removeFilter: (propertyId: string, userId?: string) => void;
    setGetUserPropertiesRequest: (val: EphemeralRequestStatus<Error>) => void;
}

export const propertiesStore = create(
    immer<UserPropertiesState & UserPropertiesActions>((set) => ({
        properties: {},
        selectedFilter: FilterOptions.NONE,
        selectedProperty: '',
        propertiesValues: {},
        filter: {},
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
        setSelectedProperty: (property) =>
            set((state) => {
                state.selectedProperty = property
            }),
        setPropertiesValues: (propertyValues) => 
            set((state) => {
                state.propertiesValues[state.selectedProperty] = propertyValues
            }),
        setFilter: (selectedPropertyValue) => 
            set((state) => {
                if (state.filter[state.selectedProperty]) {
                    state.filter[state.selectedProperty]?.userIds?.push(selectedPropertyValue)
                }else {
                    state.filter[state.selectedProperty] = {
                        id: state.selectedProperty,
                        userIds: [selectedPropertyValue]
                    } 
                }
            }),
        removeFilter: (propertyId, userIdToDelete) => 
            set((state) => {
                if (!userIdToDelete || (state.filter[propertyId]?.userIds?.length as number) < 2){
                    delete state.filter[propertyId]
                } else {
                    (state.filter[propertyId] as any).userIds = state.filter[propertyId]?.userIds?.filter(userId => userId !== userIdToDelete)
                }
            })
    })
))

export const UsersFilter = ({
    workspaceId,
}: {
    workspaceId: string,
}) => {
  const filter = propertiesStore((store) => store.filter)
  const removeFilter = propertiesStore((store) => store.removeFilter)
  const userPropertyFilter = useMemo(() => Object.values(filter), [filter])
  const properties = propertiesStore((store) => store.properties)
  const propertiesValues = propertiesStore((store) => store.propertiesValues)
  const getUserPropertiesRequest = propertiesStore((store) => store.getUserPropertiesRequest);
  const setGetUserPropertiesRequest = propertiesStore((store) => store.setGetUserPropertiesRequest);
  const setProperties = propertiesStore((store) => store.setProperties);
  const apiBase = useAppStore((store) => store.apiBase);


  React.useEffect(() => {
    const setLoadResponse = (response: GetUserPropertiesResponse) => {
        setProperties(response.properties);
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
        <FilterSelector workspaceId={workspaceId}/>
    </Stack>
  );
}

