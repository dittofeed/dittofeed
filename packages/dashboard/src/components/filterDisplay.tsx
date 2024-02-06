import Stack from "@mui/material/Stack";
import UserFilter from "./usersFilter";
import Typography from "@mui/material/Typography";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import { Box } from "@mui/material";
import React, { useMemo } from "react";
import { CompletionStatus, EphemeralRequestStatus, GetUserPropertiesResponse, UserPropertyResource } from "isomorphic-lib/src/types";
import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";


interface UserPropertiesState {
    properties: Record<string, string>, 
    selectedProperty: string,
    propertiesValues: {[key: string]: Record<string,string>},
    selectedPropertySelectedValue: {
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
    setSelectedProperty: (val: string) => void;
    setPropertiesValues: (val: Record<string,string>) => void;
    setSelectedPropertySelectedValue: (val: string) => void;
    setGetUserPropertiesRequest: (val: EphemeralRequestStatus<Error>) => void;
}

export const propertiesStore = create(
    immer<UserPropertiesState & UserPropertiesActions>((set) => ({
        properties: {},
        selectedProperty: '',
        propertiesValues: {},
        selectedPropertySelectedValue: {},
        getUserPropertiesRequest: {
            type: CompletionStatus.NotStarted,
        },
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
                console.log({property})
                state.selectedProperty = property
            }),
        setPropertiesValues: (propertyValues) => 
            set((state) => {
                state.propertiesValues[state.selectedProperty] = propertyValues
            }),
        setSelectedPropertySelectedValue: (selectedPropertyValue) => 
            set((state) => {
                if (state.selectedPropertySelectedValue[state.selectedProperty]) {
                    state.selectedPropertySelectedValue[state.selectedProperty]?.userIds?.push(selectedPropertyValue)
                }else {
                    state.selectedPropertySelectedValue[state.selectedProperty] = {
                        id: state.selectedProperty,
                        userIds: [selectedPropertyValue]
                    } 
                }

            })
    })
))

export const FilterDisplay = ({
    property,
    value
}: {
    property: string,
    value: string
}) => {
  const workspace = useAppStore((state) => state.workspace);
  const apiBase = useAppStore((state) => state.apiBase);
  if (workspace.type !== CompletionStatus.Successful) {
    return null;
  }


  const selectedPropertySelectedValue = propertiesStore((store) => store.selectedPropertySelectedValue)
  const userPropertyFilter = useMemo(() => Object.values(selectedPropertySelectedValue), [selectedPropertySelectedValue])
  const properties = propertiesStore((store) => store.properties)
  const propertiesValues = propertiesStore((store) => store.propertiesValues)
  const getUserPropertiesRequest = propertiesStore((store) => store.getUserPropertiesRequest);
  const setGetUserPropertiesRequest = propertiesStore((store) => store.setGetUserPropertiesRequest);
  const setProperties = propertiesStore((store) => store.setProperties);


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
           workspaceId: workspace.value.id 
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
                <Breadcrumbs aria-label="breadcrumb" separator=">">
                    <Typography color="inherit">
                     {properties[property.id]}
                    </Typography>
                    {property.userIds && property.userIds.map((userId) => 
                        <Typography color="inherit">
                          {(propertiesValues[property.id] as Record<string,string>)[userId]} 
                        </Typography>
                    )}
                </Breadcrumbs>
            </Box>
         )}
        <UserFilter/>
    </Stack>
  );
}

