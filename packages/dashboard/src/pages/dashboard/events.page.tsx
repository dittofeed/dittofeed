import React from "react";
import { Box, Stack, useTheme } from "@mui/material";
import { shallow } from "zustand/shallow";
import { DataGrid } from "@mui/x-data-grid";
import Head from "next/head";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import backendConfig from "backend-lib/src/config";

import MainLayout from "../../components/mainLayout";
import {
  CompletionStatus,
  EphemeralRequestStatus,
  GetEventsRequest,
  GetEventsResponse,
  GetEventsResponseItem,
} from "isomorphic-lib/src/types";
import {
  PreloadedState,
  PropsWithInitialState,
  addInitialStateToProps,
  useAppStore,
} from "../../lib/appStore";
import axios, { AxiosResponse } from "axios";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { GetServerSideProps } from "next";
import prisma from "../../lib/prisma";

interface EventsState {
  pageSize: number;
  page: number;
  totalRowCount: number;
  events: GetEventsResponseItem[];
  eventsPaginationRequest: EphemeralRequestStatus<Error>;
}

type PaginationModel = Pick<EventsState, "page" | "pageSize">;

interface EventsActions {
  updateEvents: (key: EventsState["events"]) => void;
  updatePagination: (key: PaginationModel) => void;
  updateTotalRowCount: (key: EventsState["totalRowCount"]) => void;
  updateEventsPaginationRequest: (
    key: EventsState["eventsPaginationRequest"]
  ) => void;
}

export const useEventsStore = create(
  immer<EventsState & EventsActions>((set) => ({
    pageSize: 0,
    page: 0,
    totalRowCount: 0,
    events: [],
    eventsPaginationRequest: {
      type: CompletionStatus.NotStarted,
    },
    updateEvents: (events) =>
      set((state) => {
        state.events = events;
      }),
    updatePagination: (pagination) =>
      set((state) => {
        state.page = pagination.page;
        state.pageSize = pagination.pageSize;
      }),
    updateEventsPaginationRequest: (request) =>
      set((state) => {
        state.eventsPaginationRequest = request;
      }),
    updateTotalRowCount: (totalRowCount) =>
      set((state) => {
        state.totalRowCount = totalRowCount;
      }),
  }))
);
export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState
> = async (ctx) => {
  const workspaceId = backendConfig().defaultWorkspaceId;
  const serverInitialState: PreloadedState = {};

  const [workspace] = await Promise.all([
    prisma().workspace.findFirstOrThrow({
      where: {
        id: workspaceId,
      },
    }),
  ]);

  serverInitialState.workspace = {
    type: CompletionStatus.Successful,
    value: {
      id: workspaceId,
      name: workspace.name,
    },
  };

  return {
    props: addInitialStateToProps({}, serverInitialState),
  };
};

export default function Events() {
  const paginationModel = useEventsStore(
    ({ page, pageSize }) => ({
      page,
      pageSize,
    }),
    shallow
  );
  const { page, pageSize } = paginationModel;
  const workspace = useAppStore((store) => store.workspace);
  const apiBase = useAppStore((store) => store.apiBase);
  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null;
  const updatePagination = useEventsStore((store) => store.updatePagination);
  const totalRowCount = useEventsStore((store) => store.totalRowCount);
  const updateEventsPaginationRequest = useEventsStore(
    (store) => store.updateEventsPaginationRequest
  );
  const eventsPaginationRequest = useEventsStore(
    (store) => store.eventsPaginationRequest
  );
  const events = useEventsStore((store) => store.events);
  const updateEvents = useEventsStore((store) => store.updateEvents);

  React.useEffect(() => {
    console.log("useEffect workspace", workspace);
    (async () => {
      if (!workspaceId) {
        return;
      }

      console.log("workspaceId");
      updateEventsPaginationRequest({
        type: CompletionStatus.InProgress,
      });
      let response: AxiosResponse;
      try {
        const params: GetEventsRequest = {
          workspaceId,
          offset: page * pageSize,
          limit: pageSize,
        };

        response = await axios.get(`${apiBase}/api/events`, {
          params,
        });
      } catch (e) {
        const error = e as Error;

        updateEventsPaginationRequest({
          type: CompletionStatus.Failed,
          error,
        });
        return;
      }
      const result = schemaValidate(response.data, GetEventsResponse);
      if (result.isErr()) {
        console.error("unable parse response", result.error);

        updateEventsPaginationRequest({
          type: CompletionStatus.Failed,
          error: new Error(JSON.stringify(result.error)),
        });
        return;
      }

      updateEvents(result.value.events);
      updateEventsPaginationRequest({
        type: CompletionStatus.NotStarted,
      });
    })();
  }, [
    page,
    pageSize,
    workspaceId,
    updateEventsPaginationRequest,
    updateEvents,
    apiBase,
  ]);

  // const { }
  // const { isLoading, rows, pageInfo } = useQuery(paginationModel);

  // Some API clients return undefined while loading
  // Following lines are here to prevent `rowCountState` from being undefined during the loading
  // React.useEffect(() => {
  //   updateTotalRowCount((prevRowCountState) =>
  //     pageInfo?.totalRowCount !== undefined
  //       ? pageInfo?.totalRowCount
  //       : prevRowCountState
  //   );
  // }, [totalRowCount, updateTotalRowCount]);

  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <MainLayout>
        <Stack
          direction="column"
          alignItems="center"
          justifyContent="center"
          sx={{ width: "100%", height: "100%" }}
        >
          <DataGrid
            rows={events}
            autoPageSize
            columns={[
              {
                field: "messageId",
              },
              {
                field: "eventType",
              },
              {
                field: "event",
              },
              {
                field: "userId",
              },
              {
                field: "anonymousId",
              },
              {
                field: "processingTime",
              },
              {
                field: "eventTime",
              },
            ]}
            rowCount={totalRowCount}
            loading={
              eventsPaginationRequest.type === CompletionStatus.InProgress
            }
            // pageSizeOptions={[5]}
            paginationModel={paginationModel}
            paginationMode="server"
            onPaginationModelChange={updatePagination}
          />
          ;
        </Stack>
      </MainLayout>
    </>
  );
}
