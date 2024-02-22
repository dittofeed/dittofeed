import { Visibility } from "@mui/icons-material";
import SearchIcon from "@mui/icons-material/Search";
import {
  Box,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  useTheme,
} from "@mui/material";
import {
  DataGrid,
  DataGridProps,
  GridColDef,
  GridRenderCellParams,
} from "@mui/x-data-grid";
import axios, { AxiosResponse } from "axios";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  ChannelType,
  CompletionStatus,
  EphemeralRequestStatus,
  GetEventsRequest,
  GetEventsResponse,
  GetEventsResponseItem,
} from "isomorphic-lib/src/types";
import React, { useMemo, useState, useEffect } from "react";
import { useNavigate, useLocation } from 'react-router-dom';
import { useDebounce } from "use-debounce";
import { v4 as uuid } from "uuid";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { shallow } from "zustand/shallow";

import { useAppStore } from "../lib/appStore";
import { LinkCell, monospaceCell } from "../lib/datagridCells";
import { getTemplatesLink } from "../lib/templatesLink";
import { EventResources } from "../lib/types";
import EventDetailsSidebar from "./eventDetailsSidebar";

interface EventsState {
  pageSize: number;
  page: number;
  totalRowCount: number;
  events: GetEventsResponseItem[];
  eventsPaginationRequest: EphemeralRequestStatus<Error>;
  selectedEvent: string | null;
}

type PaginationModel = Pick<EventsState, "page" | "pageSize">;

interface EventsActions {
  updateEvents: (key: EventsState["events"]) => void;
  updatePagination: (key: PaginationModel) => void;
  updateTotalRowCount: (key: EventsState["totalRowCount"]) => void;
  updateEventsPaginationRequest: (
    key: EventsState["eventsPaginationRequest"],
  ) => void;
  updateSelectedEvent: (key: string | null) => void; // Add updateSelectedEvent action
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
    selectedEvent: null, // Initialize selectedEvent to null
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
    updateSelectedEvent: (selectedEvent) =>
      set((state) => {
        state.selectedEvent = selectedEvent;
      }), // Implement updateSelectedEvent action
  })),
);

const baseColumn: Partial<GridColDef<GetEventsResponseItem>> = {
  flex: 1,
  sortable: false,
  filterable: false,
  renderCell: monospaceCell,
};

function generatePreviewColumn(
  openSideBar: (params: GridRenderCellParams<GetEventsResponseItem>) => void,
): GridColDef {
  return {
    ...baseColumn,
    field: "preview",
    headerName: "",
    renderCell: (params: GridRenderCellParams<GetEventsResponseItem>) => {
      return (
        <IconButton onClick={() => openSideBar(params)}>
          <Visibility />
        </IconButton>
      );
    },
  };
}

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
  const messagesResult = useAppStore((store) => store.messages);
  const broadcasts = useAppStore((store) => store.broadcasts);
  const journeys = useAppStore((store) => store.journeys);
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
  const updateSelectedEvent = useEventsStore(
    (store) => store.updateSelectedEvent
  ); // Get updateSelectedEvent action
  const eventsPaginationRequest = useEventsStore(
    (store) => store.eventsPaginationRequest,
  );
  const selectedEvent = useEventsStore((store) => store.selectedEvent); // Get selectedEvent state
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

  const messages =
    messagesResult.type === CompletionStatus.Successful
      ? messagesResult.value
      : [];

  const getBroadcastResources = (journeyId: string) => {
    const resources = [];
    for (const broadcast of broadcasts) {
      if (broadcast.journeyId === journeyId) {
        resources.push(
          {
            name: `${broadcast.name}`,
            link: `/broadcasts/review/${broadcast.id}`,
            key: uuid(),
          },
          {
            name: `${broadcast.name}-Template`,
            link: `/broadcasts/template/${broadcast.id}`,
            key: uuid(),
          },
        );
        break;
      }
    }
    return resources;
  };

  const getJourneyResources = (
    journeyId: string,
    templateId: string,
    templateName: string | null,
    channelType: ChannelType | null,
  ) => {
    const resources = [];
    if (journeyId) {
      const journeyValue =
        journeys.type === CompletionStatus.Successful ? journeys.value : [];

      for (const journey of journeyValue) {
        if (journey.id === journeyId) {
          resources.push({
            name: journey.name,
            link: `/journeys/${journey.id}`,
            key: uuid(),
          });
          break;
        }
      }
    }

    if (templateId && channelType && templateName) {
      resources.push({
        name: templateName,
        link: getTemplatesLink({ channel: channelType, id: templateId }),
        key: uuid(),
      });
    }

    return resources;
  };

  const getResources = (parsedTraits: any) => {
    const journeyId = parsedTraits.journeyId || "";
    const nodeId = parsedTraits.nodeId || "";

    if (nodeId === "broadcast-message") {
      const broadcastResources = getBroadcastResources(journeyId);
      return broadcastResources;
    }

    const templateId = parsedTraits.templateId || "";
    const template = messages.find((t) => t.id === templateId);
    const channelType = template?.definition?.type ?? null;
    const templateName = template?.name ?? null;

    const journeyResources = getJourneyResources(
      journeyId,
      templateId,
      templateName,
      channelType,
    );
    return journeyResources;
  };

  const cols: DataGridProps["columns"] = [
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
    {
      field: "relatedResources",
      flex: 2,
      valueGetter: (params: any) => JSON.parse(params.row.traits),
      renderCell: ({ value }: GridRenderCellParams) => {
        const relatedResources = getResources(value);

        return (
          <Stack direction="row" spacing={1}>
            {relatedResources.map((currResource) => {
              return (
                <LinkCell
                  href={currResource.link}
                  title={currResource.name}
                  key={currResource.key}
                >
                  <Box
                    sx={{
                      padding: 1,
                      backgroundColor: theme.palette.grey[200],
                      borderRadius: theme.spacing(1),
                      maxWidth: theme.spacing(16),
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      fontFamily: "monospace",
                    }}
                  >
                    {`${currResource.name}  `}
                  </Box>
                </LinkCell>
              );
            })}
          </Stack>
        );
      },
    },
  ].map((c) => ({ ...baseColumn, ...c }));

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null); // Track selected event ID locally

  const navigate = useNavigate();
  const location = useLocation();

  const [debouncedSearchTerm] = useDebounce(searchTerm, 300);

  useEffect(() => {
    // Update URL when selected event changes
    if (selectedEventId) {
      const searchParams = new URLSearchParams(location.search);
      searchParams.set('event', selectedEventId);
      navigate(`?${searchParams.toString()}`);
    }
  }, [selectedEventId, navigate, location.search]);

  useEffect(() => {
    // Extract selected event ID from URL and update state
    const searchParams = new URLSearchParams(location.search);
    const eventId = searchParams.get('event');
    if (eventId !== selectedEventId) {
      setSelectedEventId(eventId);
    }
  }, [location.search, selectedEventId, setSelectedEventId]);

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
          searchTerm:
            debouncedSearchTerm !== "" ? debouncedSearchTerm : undefined,
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
    debouncedSearchTerm,
    page,
    pageSize,
    workspaceId,
    userId,
    updateTotalRowCount,
    updateEvents,
    apiBase,
  ]);

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [selectedEventResources, setSelectedEventResources] = useState<
    EventResources[]
  >([]);

  const handleEventSelection = (
    params: GridRenderCellParams<GetEventsResponseItem>,
  ) => {
    const selectedRow = params.row;
    setSelectedEventResources(
      getResources(JSON.parse(selectedRow.traits))
    );
    updateSelectedEvent(selectedRow.messageId);
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
          // eslint-disable-next-line react/no-unstable-nested-components
          toolbar: ({ onChange, value }) => (
            <TextField
              id="search"
              type="search"
              label="Search"
              sx={{ width: "98%", m: 2 }}
              value={value}
              onChange={onChange}
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
              setSearchTerm((event.target as HTMLInputElement).value),
          },
        }}
        getRowId={(row) => row.messageId}
        columns={[generatePreviewColumn(handleEventSelection), ...cols]}
        rowCount={totalRowCount}
        loading={eventsPaginationRequest.type === CompletionStatus.InProgress}
        pageSizeOptions={[paginationModel.pageSize]}
        paginationModel={paginationModel}
        paginationMode="server"
        onPaginationModelChange={updatePagination}
      />

      <EventDetailsSidebar
        open={isSidebarOpen}
        onClose={closeSidebar}
        // Parse the selectedEvent string to a SelectedEvent object or set it to null if it is not a valid JSON string
        selectedEvent={selectedEvent ? JSON.parse(selectedEvent) : null}
        eventResources={selectedEventResources}
      />
    </>
  );
}
