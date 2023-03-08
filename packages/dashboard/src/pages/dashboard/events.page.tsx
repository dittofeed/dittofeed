import { Box, Stack, Tooltip, useTheme } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import axios, { AxiosResponse } from "axios";
import backendConfig from "backend-lib/src/config";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  EphemeralRequestStatus,
  GetEventsRequest,
  GetEventsResponse,
  GetEventsResponseItem,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import React from "react";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { shallow } from "zustand/shallow";

import MainLayout from "../../components/mainLayout";
import {
  addInitialStateToProps,
  PreloadedState,
  PropsWithInitialState,
  useAppStore,
} from "../../lib/appStore";
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
    pageSize: 10,
    page: 0,
    totalRowCount: 2,
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
> = async () => {
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

function renderCell(params: any) {
  return (
    <Tooltip title={params.value} placement="right-start">
      <Box sx={{ fontFamily: "monospace" }}>{params.value}</Box>
    </Tooltip>
  );
}

const baseColumn: Partial<GridColDef<GetEventsResponseItem>> = {
  flex: 1,
  sortable: false,
  filterable: false,
  renderCell,
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
  const theme = useTheme();
  const workspace = useAppStore((store) => store.workspace);
  const apiBase = useAppStore((store) => store.apiBase);
  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null;
  const updatePagination = useEventsStore((store) => store.updatePagination);
  const totalRowCount = useEventsStore((store) => store.totalRowCount);
  const updateTotalRowCount = useEventsStore(
    (store) => store.updateTotalRowCount
  );
  const updateEventsPaginationRequest = useEventsStore(
    (store) => store.updateEventsPaginationRequest
  );
  const eventsPaginationRequest = useEventsStore(
    (store) => store.eventsPaginationRequest
  );
  const events = useEventsStore((store) => store.events);
  const updateEvents = useEventsStore((store) => store.updateEvents);

  React.useEffect(() => {
    (async () => {
      if (!workspaceId) {
        return;
      }

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
      updateTotalRowCount(result.value.count);

      updateEventsPaginationRequest({
        type: CompletionStatus.NotStarted,
      });
    })();
  }, [
    page,
    pageSize,
    workspaceId,
    updateTotalRowCount,
    updateEventsPaginationRequest,
    updateEvents,
    apiBase,
  ]);

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
          paddingBottom={2}
          paddingTop={2}
          sx={{ width: "100%", height: "100%" }}
        >
          <Box sx={{ width: 1200, height: "100%" }}>
            <DataGrid
              rows={events}
              sx={{
                border: 2,
                borderColor: theme.palette.grey[200],
              }}
              getRowId={(row) => row.messageId}
              columns={[
                {
                  field: "userId",
                },
                {
                  field: "anonymousId",
                },
                {
                  field: "eventType",
                },
                {
                  field: "event",
                },
                {
                  field: "traits",
                  flex: 2,
                },
                {
                  field: "eventTime",
                  flex: 1,
                },
                {
                  field: "processingTime",
                  flex: 1,
                },
                {
                  field: "messageId",
                  flex: 1,
                },
              ].map((c) => ({ ...baseColumn, ...c }))}
              rowCount={totalRowCount}
              loading={
                eventsPaginationRequest.type === CompletionStatus.InProgress
              }
              pageSizeOptions={[paginationModel.pageSize]}
              paginationModel={paginationModel}
              paginationMode="server"
              onPaginationModelChange={updatePagination}
            />
          </Box>
        </Stack>
      </MainLayout>
    </>
  );
}
