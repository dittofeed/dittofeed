import { CalendarDate } from "@internationalized/date";
import {
  Computer,
  ContentCopy as ContentCopyIcon,
  Home,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  OpenInNew,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
} from "@mui/icons-material";
import {
  Box,
  CircularProgress,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Popover,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData } from "@tanstack/react-query";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  Row,
  useReactTable,
} from "@tanstack/react-table";
import { subDays, subMinutes } from "date-fns";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import { messageTemplatePath } from "isomorphic-lib/src/messageTemplates";
import {
  jsonParseSafe,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  GetEventsResponseItem,
  RelatedResourceProperties,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { Updater, useImmer } from "use-immer";
import { v4 as uuid } from "uuid";

import { useAppStorePick } from "../lib/appStore";
import { toCalendarDate } from "../lib/dates";
import { EventResources } from "../lib/types";
import { useEventsQuery } from "../lib/useEventsQuery";
import EventDetailsSidebar from "./eventDetailsSidebar";
import { GreyButton } from "./greyButtonStyle";
import { greyMenuItemStyles, greySelectStyles } from "./greyScaleStyles";
import { RangeCalendar } from "./rangeCalendar";

interface MinuteTimeOption {
  type: "minutes";
  id: string;
  minutes: number;
  label: string;
}

interface CustomTimeOption {
  type: "custom";
  id: "custom";
  label: string;
}

type TimeOption = MinuteTimeOption | CustomTimeOption;

const defaultTimeOption = {
  type: "minutes",
  id: "last-7-days",
  minutes: 7 * 24 * 60,
  label: "Last 7 days",
} as const;

const timeOptions: TimeOption[] = [
  { type: "minutes", id: "last-hour", minutes: 60, label: "Last hour" },
  {
    type: "minutes",
    id: "last-24-hours",
    minutes: 24 * 60,
    label: "Last 24 hours",
  },
  defaultTimeOption,
  {
    type: "minutes",
    id: "last-30-days",
    minutes: 30 * 24 * 60,
    label: "Last 30 days",
  },
  {
    type: "minutes",
    id: "last-90-days",
    minutes: 90 * 24 * 60,
    label: "Last 90 days",
  },
  { type: "custom", id: "custom", label: "Custom Date Range" },
];

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatCalendarDate(date: CalendarDate) {
  return formatDate(
    date.toDate(Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
}

interface State {
  query: {
    offset: number;
    limit: number;
    userId?: string;
    searchTerm?: string;
    startDate: number;
    endDate: number;
    event?: string[];
    broadcastId?: string;
    journeyId?: string;
    eventType?: string;
  };
  previewEvent: GetEventsResponseItem | null;
  selectedEventResources: EventResources[];
  isSidebarOpen: boolean;
  selectedTimeOption: string;
  referenceDate: Date;
  customDateRange: {
    start: CalendarDate;
    end: CalendarDate;
  } | null;
}

type SetState = Updater<State>;

function TimeCell({ timestamp }: { timestamp: string }) {
  const date = new Date(timestamp);
  const formatted = formatDistanceToNow(date, { addSuffix: true });

  const tooltipContent = (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Computer sx={{ color: "text.secondary" }} />
        <Stack>
          <Typography variant="body2" color="text.secondary">
            Your device
          </Typography>
          <Typography>
            {new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "numeric",
              second: "numeric",
              hour12: true,
            }).format(date)}
          </Typography>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center">
        <Home sx={{ color: "text.secondary" }} />
        <Stack>
          <Typography variant="body2" color="text.secondary">
            UTC
          </Typography>
          <Typography>
            {new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "numeric",
              second: "numeric",
              hour12: true,
              timeZone: "UTC",
            }).format(date)}
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  );

  return (
    <Tooltip title={tooltipContent} placement="bottom-start" arrow>
      <Box
        sx={{
          maxWidth: "200px",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        <Typography>{formatted}</Typography>
      </Box>
    </Tooltip>
  );
}

function UserIdCell({ value }: { value: string | null }) {
  const [showCopied, setShowCopied] = useState(false);

  if (!value) {
    return <Typography color="text.secondary">—</Typography>;
  }

  const uri = `/users/${value}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setShowCopied(true);
  };

  return (
    <>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ maxWidth: "280px" }}
      >
        <Tooltip title={value}>
          <Typography
            sx={{
              fontFamily: "monospace",
              maxWidth: "150px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value}
          </Typography>
        </Tooltip>
        <Tooltip title="Copy ID">
          <IconButton size="small" onClick={handleCopy}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="View User Profile">
          <IconButton size="small" component={Link} href={uri} target="_blank">
            <OpenInNew fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Snackbar
        open={showCopied}
        autoHideDuration={2000}
        onClose={() => setShowCopied(false)}
        message="User ID copied to clipboard"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}

function EventTypeCell({ value }: { value: string }) {
  return (
    <Box
      sx={{
        maxWidth: "150px",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
        {value}
      </Typography>
    </Box>
  );
}

function EventNameCell({ value }: { value: string }) {
  return (
    <Tooltip title={value} placement="bottom-start">
      <Typography
        sx={{
          maxWidth: "120px",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
          fontSize: "0.75rem",
          display: "block",
        }}
      >
        {value}
      </Typography>
    </Tooltip>
  );
}

function TraitsCell({ value }: { value: string }) {
  return (
    <Tooltip title={value} placement="bottom-start">
      <Typography
        variant="body2"
        sx={{
          maxWidth: "150px",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
          fontFamily: "monospace",
          fontSize: "0.65rem",
          display: "block",
        }}
      >
        {value}
      </Typography>
    </Tooltip>
  );
}

function MessageIdCell({ value }: { value: string }) {
  const [showCopied, setShowCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setShowCopied(true);
  };

  return (
    <>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ maxWidth: "200px" }}
      >
        <Tooltip title={value}>
          <Typography
            sx={{
              fontFamily: "monospace",
              fontSize: "0.75rem",
              maxWidth: "120px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value}
          </Typography>
        </Tooltip>
        <Tooltip title="Copy Message ID">
          <IconButton size="small" onClick={handleCopy}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Snackbar
        open={showCopied}
        autoHideDuration={2000}
        onClose={() => setShowCopied(false)}
        message="Message ID copied to clipboard"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}

function PreviewCell({
  row,
  setState,
  getRelatedResources,
}: {
  row: Row<GetEventsResponseItem>;
  setState: SetState;
  getRelatedResources: (event: GetEventsResponseItem) => EventResources[];
}) {
  return (
    <Stack
      alignItems="center"
      sx={{
        height: "100%",
      }}
    >
      <Tooltip title="View Event Details">
        <IconButton
          size="small"
          onClick={() => {
            setState((draft) => {
              draft.previewEvent = row.original;
              draft.selectedEventResources = getRelatedResources(row.original);
              draft.isSidebarOpen = true;
            });
          }}
        >
          <VisibilityIcon sx={{ color: "#262626", cursor: "pointer" }} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

interface UserEventsTableProps {
  userId?: string;
  searchTerm?: string;
  startDate?: number;
  endDate?: number;
  event?: string[];
  broadcastId?: string;
  journeyId?: string;
  eventType?: string;
}

export function UserEventsTable({
  userId,
  searchTerm: initialSearchTerm,
  startDate: propsStartDate,
  endDate: propsEndDate,
  event,
  broadcastId,
  journeyId,
  eventType,
}: UserEventsTableProps) {
  const {
    workspace,
    messages: messagesResult,
    broadcasts,
    journeys,
  } = useAppStorePick(["workspace", "messages", "broadcasts", "journeys"]);

  const initialEndDate = useMemo(
    () => propsEndDate || Date.now(),
    [propsEndDate],
  );
  const initialStartDate = useMemo(
    () =>
      propsStartDate ||
      subMinutes(initialEndDate, defaultTimeOption.minutes).getTime(),
    [propsStartDate, initialEndDate],
  );

  const [state, setState] = useImmer<State>({
    query: {
      offset: 0,
      limit: 10,
      userId,
      searchTerm: initialSearchTerm,
      startDate: initialStartDate,
      endDate: initialEndDate,
      event,
      broadcastId,
      journeyId,
      eventType,
    },
    previewEvent: null,
    selectedEventResources: [],
    isSidebarOpen: false,
    selectedTimeOption: defaultTimeOption.id,
    referenceDate: new Date(initialEndDate),
    customDateRange: null,
  });

  const messages = useMemo(
    () =>
      messagesResult.type === CompletionStatus.Successful
        ? messagesResult.value
        : [],
    [messagesResult],
  );

  const getRelatedResources = useCallback(
    (eventItem: GetEventsResponseItem): EventResources[] => {
      const parsedTraits = jsonParseSafe(eventItem.traits)
        .andThen((traits) =>
          schemaValidateWithErr(traits, RelatedResourceProperties),
        )
        .unwrapOr({} as RelatedResourceProperties);

      const eventJourneyId = parsedTraits.journeyId ?? "";
      const nodeId = parsedTraits.nodeId ?? "";
      const resources: EventResources[] = [];

      if (nodeId === "broadcast-message") {
        for (const broadcast of broadcasts) {
          if (broadcast.journeyId === eventJourneyId) {
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
      }

      if (eventJourneyId && journeys.type === CompletionStatus.Successful) {
        for (const journey of journeys.value) {
          if (journey.id === eventJourneyId) {
            resources.push({
              name: journey.name,
              link: `/journeys/${journey.id}`,
              key: uuid(),
            });
            break;
          }
        }
      }

      const templateId = parsedTraits.templateId ?? "";
      const template = messages.find((t) => t.id === templateId);
      const channelType = template?.type ?? null;
      const templateName = template?.name ?? null;

      if (templateId && channelType && templateName) {
        resources.push({
          name: templateName,
          link: messageTemplatePath({ channel: channelType, id: templateId }),
          key: uuid(),
        });
      }

      return resources;
    },
    [broadcasts, journeys, messages],
  );

  const eventsQuery = useEventsQuery(state.query, {
    placeholderData: keepPreviousData,
  });

  const onNextPage = useCallback(() => {
    setState((draft) => {
      draft.query.offset += draft.query.limit;
    });
  }, [setState]);

  const onPreviousPage = useCallback(() => {
    setState((draft) => {
      draft.query.offset = Math.max(0, draft.query.offset - draft.query.limit);
    });
  }, [setState]);

  const onFirstPage = useCallback(() => {
    setState((draft) => {
      draft.query.offset = 0;
    });
  }, [setState]);

  const renderPreviewCell = useCallback(
    ({ row }: { row: Row<GetEventsResponseItem> }) => (
      <PreviewCell
        row={row}
        setState={setState}
        getRelatedResources={getRelatedResources}
      />
    ),
    [setState, getRelatedResources],
  );

  const renderUserIdCell = useCallback(
    ({ row }: { row: Row<GetEventsResponseItem> }) => (
      <UserIdCell value={row.original.userId} />
    ),
    [],
  );

  const renderEventTypeCell = useCallback(
    ({ row }: { row: Row<GetEventsResponseItem> }) => (
      <EventTypeCell value={row.original.eventType} />
    ),
    [],
  );

  const renderEventNameCell = useCallback(
    ({ row }: { row: Row<GetEventsResponseItem> }) => (
      <EventNameCell value={row.original.event} />
    ),
    [],
  );

  const renderTraitsCell = useCallback(
    ({ row }: { row: Row<GetEventsResponseItem> }) => (
      <TraitsCell value={row.original.traits} />
    ),
    [],
  );

  const renderTimeCell = useCallback(
    ({ row }: { row: Row<GetEventsResponseItem> }) => (
      <TimeCell timestamp={row.original.eventTime} />
    ),
    [],
  );

  const renderMessageIdCell = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, react/no-unused-prop-types
    ({ row }: { row: Row<GetEventsResponseItem> }) => (
      <MessageIdCell value={row.original.messageId} />
    ),
    [],
  );

  const columns = useMemo<ColumnDef<GetEventsResponseItem>[]>(
    () => [
      {
        id: "preview",
        cell: renderPreviewCell,
      },
      {
        id: "userId",
        header: "User ID",
        accessorKey: "userId",
        cell: renderUserIdCell,
      },
      {
        id: "eventType",
        header: "Type",
        accessorKey: "eventType",
        cell: renderEventTypeCell,
      },
      {
        id: "event",
        header: "Event",
        accessorKey: "event",
        cell: renderEventNameCell,
      },
      {
        id: "traits",
        header: "Properties",
        accessorKey: "traits",
        cell: renderTraitsCell,
      },
      {
        id: "eventTime",
        header: "Event Time",
        accessorKey: "eventTime",
        cell: renderTimeCell,
      },
      {
        id: "messageId",
        header: "Message ID",
        accessorKey: "messageId",
        cell: renderMessageIdCell,
      },
    ],
    [
      renderPreviewCell,
      renderUserIdCell,
      renderEventTypeCell,
      renderEventNameCell,
      renderTraitsCell,
      renderTimeCell,
      renderMessageIdCell,
    ],
  );

  const data = useMemo(() => {
    const events = eventsQuery.data?.events ?? [];
    return [...events].sort((e1, e2) => {
      const t1 = new Date(e1.eventTime);
      const t2 = new Date(e2.eventTime);
      return t1.getTime() > t2.getTime() ? -1 : 1;
    });
  }, [eventsQuery.data]);

  const closeSidebar = () => {
    setState((draft) => {
      draft.isSidebarOpen = false;
    });
  };

  const table = useReactTable({
    columns,
    data,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const hasNextPage = useMemo(() => {
    if (!eventsQuery.data) return false;
    return state.query.offset + state.query.limit < eventsQuery.data.count;
  }, [eventsQuery.data, state.query.offset, state.query.limit]);

  const hasPreviousPage = useMemo(() => {
    return state.query.offset > 0;
  }, [state.query.offset]);

  const customDateRef = useRef<HTMLInputElement | null>(null);

  const customOnClickHandler = useCallback(() => {
    setState((draft) => {
      if (draft.selectedTimeOption === "custom") {
        draft.customDateRange = {
          start: toCalendarDate(draft.referenceDate),
          end: toCalendarDate(draft.referenceDate),
        };
      }
    });
  }, [setState]);

  if (workspace.type !== CompletionStatus.Successful) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <Typography color="error">Workspace not available</Typography>
      </Box>
    );
  }

  return (
    <Stack
      spacing={1}
      sx={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        alignItems: "stretch",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ width: "100%", height: "48px" }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h6">User Events</Typography>
          <FormControl>
            <Select
              value={state.selectedTimeOption}
              renderValue={(value) => {
                const option = timeOptions.find((o) => o.id === value);
                if (option?.type === "custom") {
                  return `${formatDate(new Date(state.query.startDate))} - ${formatDate(new Date(state.query.endDate))}`;
                }
                return option?.label;
              }}
              ref={customDateRef}
              MenuProps={{
                anchorOrigin: {
                  vertical: "bottom",
                  horizontal: "left",
                },
                transformOrigin: {
                  vertical: "top",
                  horizontal: "left",
                },
                sx: greyMenuItemStyles,
              }}
              sx={greySelectStyles}
              onChange={(e) =>
                setState((draft) => {
                  if (e.target.value === "custom") {
                    const dayBefore = subDays(draft.referenceDate, 1);
                    draft.customDateRange = {
                      start: toCalendarDate(dayBefore),
                      end: toCalendarDate(draft.referenceDate),
                    };
                    return;
                  }
                  const option = timeOptions.find(
                    (o) => o.id === e.target.value,
                  );
                  if (option === undefined || option.type !== "minutes") {
                    return;
                  }
                  draft.selectedTimeOption = option.id;
                  draft.query.startDate = subMinutes(
                    draft.referenceDate,
                    option.minutes,
                  ).getTime();
                  draft.query.endDate = draft.referenceDate.getTime();
                  draft.query.offset = 0;
                })
              }
              size="small"
            >
              {timeOptions.map((option) => (
                <MenuItem
                  key={option.id}
                  value={option.id}
                  onClick={
                    option.id === "custom" ? customOnClickHandler : undefined
                  }
                >
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Refresh Results" placement="bottom-start">
            <IconButton
              disabled={state.selectedTimeOption === "custom"}
              onClick={() => {
                setState((draft) => {
                  const option = timeOptions.find(
                    (o) => o.id === draft.selectedTimeOption,
                  );
                  if (option === undefined || option.type !== "minutes") {
                    return;
                  }
                  draft.query.offset = 0;
                  const endDate = new Date();
                  draft.query.endDate = endDate.getTime();
                  draft.query.startDate = subMinutes(
                    endDate,
                    option.minutes,
                  ).getTime();
                });
              }}
              sx={{
                border: "1px solid",
                borderColor: "grey.400",
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Popover
        open={Boolean(state.customDateRange)}
        anchorEl={customDateRef.current}
        onClose={() => {
          setState((draft) => {
            draft.customDateRange = null;
          });
        }}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
      >
        <RangeCalendar
          value={state.customDateRange}
          visibleDuration={{ months: 2 }}
          onChange={(newValue) => {
            setState((draft) => {
              draft.customDateRange = newValue;
            });
          }}
          footer={
            <Stack direction="row" justifyContent="space-between">
              <Stack justifyContent="center" alignItems="center" flex={1}>
                {state.customDateRange?.start &&
                  formatCalendarDate(state.customDateRange.start)}
                {" - "}
                {state.customDateRange?.end &&
                  formatCalendarDate(state.customDateRange.end)}
              </Stack>
              <Stack direction="row" spacing={1}>
                <GreyButton
                  onClick={() => {
                    setState((draft) => {
                      draft.customDateRange = null;
                    });
                  }}
                >
                  Cancel
                </GreyButton>
                <GreyButton
                  onClick={() => {
                    setState((draft) => {
                      if (draft.customDateRange) {
                        draft.query.startDate = draft.customDateRange.start
                          .toDate(
                            Intl.DateTimeFormat().resolvedOptions().timeZone,
                          )
                          .getTime();
                        draft.query.endDate = draft.customDateRange.end
                          .toDate(
                            Intl.DateTimeFormat().resolvedOptions().timeZone,
                          )
                          .getTime();

                        draft.customDateRange = null;
                        draft.selectedTimeOption = "custom";
                        draft.query.offset = 0;
                      }
                    });
                  }}
                  sx={{
                    borderColor: "grey.400",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    fontWeight: "bold",
                  }}
                >
                  Apply
                </GreyButton>
              </Stack>
            </Stack>
          }
        />
      </Popover>

      <TableContainer component={Paper}>
        <Table stickyHeader>
          <TableHead>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableCell key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : (
                      <Box>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </Box>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableHead>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  return (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter
            sx={{
              position: "sticky",
              bottom: 0,
            }}
          >
            <TableRow>
              <TableCell
                colSpan={table.getAllColumns().length}
                sx={{
                  bgcolor: "background.paper",
                  borderTop: "1px solid",
                  borderColor: "grey.100",
                }}
              >
                <Stack
                  direction="row"
                  spacing={2}
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <GreyButton
                      onClick={onFirstPage}
                      disabled={!hasPreviousPage}
                      startIcon={<KeyboardDoubleArrowLeft />}
                    >
                      First
                    </GreyButton>
                    <GreyButton
                      onClick={onPreviousPage}
                      disabled={!hasPreviousPage}
                      startIcon={<KeyboardArrowLeft />}
                    >
                      Previous
                    </GreyButton>
                    <GreyButton
                      onClick={onNextPage}
                      disabled={!hasNextPage}
                      endIcon={<KeyboardArrowRight />}
                    >
                      Next
                    </GreyButton>
                  </Stack>

                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                      {eventsQuery.data && (
                        <>
                          Showing {state.query.offset + 1} to{" "}
                          {Math.min(
                            state.query.offset + state.query.limit,
                            eventsQuery.data.count,
                          )}{" "}
                          of {eventsQuery.data.count} events
                        </>
                      )}
                    </Typography>
                    <Box
                      sx={{
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {eventsQuery.isFetching && (
                        <CircularProgress color="inherit" size={20} />
                      )}
                    </Box>
                  </Stack>
                </Stack>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>
      <EventDetailsSidebar
        open={state.isSidebarOpen}
        onClose={closeSidebar}
        selectedEvent={state.previewEvent}
        eventResources={state.selectedEventResources}
      />
    </Stack>
  );
}
