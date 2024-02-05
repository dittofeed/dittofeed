import { Fab, Typography, useTheme } from "@mui/material";
import Stack from "@mui/material/Stack";
import { Type } from "@sinclair/typebox";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { CompletionStatus, EphemeralRequestStatus, GetUserPropertiesResponse, GetUsersRequest, UserPropertyResource } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React, { useMemo } from "react";

import MainLayout from "../components/mainLayout";
import UsersTable, { OnPaginationChangeProps } from "../components/usersTable";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { useAppStore } from "../lib/appStore";
import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import UserFilter from "../components/usersFilter";

const QueryParams = Type.Pick(GetUsersRequest, ["cursor", "direction"]);

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => ({
    props: addInitialStateToProps({
      serverInitialState: {},
      dfContext,
      props: {},
    }),
  }));

interface UserPropertiesState {
    // Records<propertyName, propertyId>
    properties: Record<string, string>, 

    // String = name of selected property. Used to index the properties object (defined above).
    selectedProperty: string,

    // Once selected property is populated, this will be set by getting all values for the selected property.
    selectedPropertyValues: Record<string,string>,

    // Chosen from the selectedPropertyValues object. Will be sent as part of the query 
    // to get all users that have a property matching the selected value.
    selectedPropertySelectedValue: {
        [key: string]: {
            id: string,
            values?: string[],
            partial?: string[]
        }
    },

    // Used to indicate status of the getUserProperties request.
    getUserPropertiesRequest: EphemeralRequestStatus<Error>
}

interface UserPropertiesActions {
    setProperties: (val: UserPropertyResource[]) => void;
    setSelectedProperty: (val: string) => void;
    setSelectedPropertyValues: (val: Record<string,string>) => void;
    setSelectedPropertySelectedValue: (val: string) => void;
    setGetUserPropertiesRequest: (val: EphemeralRequestStatus<Error>) => void;
}

export const propertiesStore = create(
    immer<UserPropertiesState & UserPropertiesActions>((set) => ({
        properties: {},
        selectedProperty: '',
        selectedPropertyValues: {},
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
                  state.properties[property.name] = property.id;
          }}),
        setSelectedProperty: (property) =>
            set((state) => {
                state.selectedProperty = property
            }),
        setSelectedPropertyValues: (propertyValues) => 
            set((state) => {
                state.selectedPropertyValues = propertyValues
            }),
        setSelectedPropertySelectedValue: (selectedPropertyValue) => 
            set((state) => {
                if (state.selectedPropertySelectedValue[state.selectedProperty]) {
                    state.selectedPropertySelectedValue[state.selectedProperty]?.values?.push(selectedPropertyValue)
                }

                state.selectedPropertySelectedValue[state.selectedProperty] = {
                    id: state.selectedProperty,
                    value: [selectedPropertyValue]
                } 
            })
    })
))


export default function SegmentUsers() {
  const theme = useTheme();
  const router = useRouter();
  const queryParams = useMemo(
    () => schemaValidate(router.query, QueryParams).unwrapOr({}),
    [router.query],
  );
  const workspace = useAppStore((state) => state.workspace);
  if (workspace.type !== CompletionStatus.Successful) {
    return null;
  }


  const apiBase = useAppStore((state) => state.apiBase);
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

  const onUsersTablePaginate = ({
    direction,
    cursor,
  }: OnPaginationChangeProps) => {
    router.push({
      pathname: router.pathname,
      query: {
        ...router.query,
        direction,
        cursor,
      },
    });
  };


  return (
    <MainLayout>
      <Stack
        spacing={1}
        sx={{
          width: "100%",
          height: "100%",
          padding: 3,
          backgroundColor: theme.palette.grey[100],
        }}
      >
        <Stack direction="row">
            <Typography variant="h4">Users</Typography>
            <UserFilter/>
        </Stack>
        <UsersTable
          {...queryParams}
          workspaceId={workspace.value.id}
          onPaginationChange={onUsersTablePaginate}
        />
      </Stack>
    </MainLayout>
  );
}
