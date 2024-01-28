import SearchIcon from "@mui/icons-material/Search";
import {
  Box,
  Container,
  IconButton,
  InputAdornment,
  LinearProgress,
  TextField,
  useTheme,
} from "@mui/material";
import {
  DataGrid,
  GridColDef,
  GridColumnMenu,
  GridRenderCellParams,
  GridRowParams,
  GridSearchIcon,
} from "@mui/x-data-grid";
import axios, { AxiosResponse } from "axios";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  EphemeralRequestStatus,
  GetEventsRequest,
  GetEventsResponse,
  GetEventsResponseItem,
} from "isomorphic-lib/src/types";
import React, { useMemo, useState } from "react";
import { useDebounce } from "use-debounce";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { shallow } from "zustand/shallow";

import { useAppStore } from "../lib/appStore";
import { LinkCell, monospaceCell } from "../lib/datagridCells";
import EventDetailsSidebar from "./eventDetailsSidebar";

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
    key: EventsState["eventsPaginationRequest"],
  ) => void;
}

interface HandleChanges {
  event: any;
  page: number;
  pageSize: number;
  workspaceId: string;
  userId: string | undefined;
  updateTotalRowCount: (key: number) => void;
  updateEvents: (
    key: {
      userId: string | null;
      traits: string;
      messageId: string;
      eventType: string;
      event: string;
      anonymousId: string | null;
      processingTime: string;
      eventTime: string;
    }[],
  ) => void;
  apiBase: string;
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
  })),
);

const baseColumn: Partial<GridColDef<GetEventsResponseItem>> = {
  flex: 1,
  sortable: false,
  filterable: false,
  renderCell: monospaceCell,
};

export function EventsTable({
  userId,
}: Omit<GetEventsRequest, "workspaceId" | "offset" | "limit">) {
  const paginationModel = useEventsStore(
    ({ page, pageSize }) => ({
      page,
      pageSize,
    }),
    shallow,
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
    (store) => store.updateTotalRowCount,
  );
  const updateEventsPaginationRequest = useEventsStore(
    (store) => store.updateEventsPaginationRequest,
  );
  const eventsPaginationRequest = useEventsStore(
    (store) => store.eventsPaginationRequest,
  );
  const events = useEventsStore((store) => store.events);
  const sortedEvents = useMemo(
    () =>
      [...events].sort((e1, e2) => {
        const t1 = new Date(e1.eventTime);
        const t2 = new Date(e2.eventTime);
        return t1.getTime() > t2.getTime() ? -1 : 1;
      }),
    [events],
  );
  const updateEvents = useEventsStore((store) => store.updateEvents);

  const cols = [
    {
      field: "userId",
      renderCell: ({ value }: GridRenderCellParams) => (
        <LinkCell href={`/users/${value}`} title={value}>
          <Box
            sx={{
              fontFamily: "monospace",
            }}
          >
            {value}
          </Box>
        </LinkCell>
      ),
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
  ];

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
          userId,
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

      const eventsWithId = result.value.events.map((event) => ({
        ...event,
        id: event.messageId,
      }));
      updateEvents(eventsWithId);
      updateTotalRowCount(result.value.count);

      updateEventsPaginationRequest({
        type: CompletionStatus.NotStarted,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    pageSize,
    workspaceId,
    userId,
    updateTotalRowCount,
    updateEvents,
    apiBase,
  ]);
  /// ////////////////////////////////////////////////////////////////////////////

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchTerm, 300);

  const handleSearchTermChange = async ({
    event,
    page,
    pageSize,
    workspaceId,
    userId,
    updateTotalRowCount,
    updateEvents,
    apiBase,
  }: HandleChanges) => {
    const text = (event.target as HTMLInputElement).value;
    setSearchTerm(text);
    if (debouncedSearchTerm === "") return;
    let response: AxiosResponse;
    try {
      const params: GetEventsRequest = {
        workspaceId,
        userId,
        offset: page * pageSize,
        limit: pageSize,
        searchTerm: debouncedSearchTerm,
      };
      updateEventsPaginationRequest({
        type: CompletionStatus.InProgress,
      });
      response = await axios.get(`${apiBase}/api/events`, {
        params,
      });
      console.info(response);
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

    const eventsWithId = result.value.events.map((event) => ({
      ...event,
      id: event.messageId,
    }));
    updateEvents(eventsWithId);
    updateTotalRowCount(result.value.count);

    updateEventsPaginationRequest({
      type: CompletionStatus.NotStarted,
    });
  };

  /// ////////////////////////////////////////////////////////////////////////////

  const [selectedEvent, setSelectedEvent] =
    useState<GetEventsResponseItem | null>(null);
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const handleEventSelection = (params: GridRowParams) => {
    const selectedRow: GetEventsResponseItem =
      params.row as GetEventsResponseItem;
    setSelectedEvent(selectedRow);
    setSidebarOpen(true);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <>
      <DataGrid
        rows={sortedEvents}
        sx={{
          border: 2,
          borderColor: theme.palette.grey[200],
        }}
        slots={{
          toolbar: ({ onChange, value }) => (
            <TextField
              id="search"
              type="search"
              label="Search"
              sx={{ width: "98%", m: 2 }}
              value={value}
              onChange={onChange}
              autoFocus
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          ),
        }}
        slotProps={{
          toolbar: {
            value: searchTerm,
            onChange: (event) =>
              handleSearchTermChange({
                event,
                page,
                pageSize,
                workspaceId: workspaceId!,
                userId,
                updateTotalRowCount,
                updateEvents,
                apiBase,
              }),
          },
        }}
        getRowId={(row) => row.messageId}
        columns={cols.map((c) => ({ ...baseColumn, ...c }))}
        rowCount={totalRowCount}
        loading={eventsPaginationRequest.type === CompletionStatus.InProgress}
        pageSizeOptions={[paginationModel.pageSize]}
        paginationModel={paginationModel}
        paginationMode="server"
        onPaginationModelChange={updatePagination}
        onRowClick={handleEventSelection}
      />
      <EventDetailsSidebar
        open={isSidebarOpen}
        onClose={closeSidebar}
        selectedEvent={selectedEvent}
      />
    </>
  );
}
