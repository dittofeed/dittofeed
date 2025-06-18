import {
  ContentCopy as ContentCopyIcon,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  OpenInNew,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Visibility as VisibilityIcon,
} from "@mui/icons-material";
import {
  Box,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { keepPreviousData } from "@tanstack/react-query";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  Row,
  useReactTable,
} from "@tanstack/react-table";
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
import { useCallback, useMemo, useState } from "react";
import { useDebounce } from "use-debounce";
import { Updater, useImmer } from "use-immer";
import { v4 as uuid } from "uuid";

import { useAppStorePick } from "../lib/appStore";
import { useEventsQuery } from "../lib/useEventsQuery";
import { EventResources } from "../lib/types";
import EventDetailsSidebar from "./eventDetailsSidebar";
import { GreyButton } from "./greyButtonStyle";

interface State {
  query: {
    offset: number;
    limit: number;
    userId?: string;
    searchTerm?: string;
    startDate?: number;
    endDate?: number;
  };
  previewEvent: GetEventsResponseItem | null;
  selectedEventResources: EventResources[];
  isSidebarOpen: boolean;
}

type SetState = Updater<State>;

function TimeCell({ timestamp }: { timestamp: string }) {
  const date = new Date(timestamp);
  const formatted = formatDistanceToNow(date, { addSuffix: true });
  
  const tooltipContent = (
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
}: {
  row: Row<GetEventsResponseItem>;
  setState: SetState;
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

function RelatedResourcesCell({ 
  value, 
  messages,
  broadcasts,
  journeys,
  theme 
}: { 
  value: string;
  messages: any[];
  broadcasts: any[];
  journeys: any;
  theme: any;
}) {
  const parsedTraits = jsonParseSafe(value)
    .andThen((traits) =>
      schemaValidateWithErr(traits, RelatedResourceProperties),
    )
    .unwrapOr({} satisfies RelatedResourceProperties);

  const getResources = (parsedTraits: RelatedResourceProperties) => {
    const journeyId = parsedTraits.journeyId ?? "";
    const nodeId = parsedTraits.nodeId ?? "";
    const resources = [];

    if (nodeId === "broadcast-message") {
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
    }

    if (journeyId && journeys.type === CompletionStatus.Successful) {
      for (const journey of journeys.value) {
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
  };

  const relatedResources = getResources(parsedTraits);

  return (
    <Stack direction="row" spacing={1}>
      {relatedResources.map((currResource) => {
        return (
          <Link
            href={currResource.link}
            key={currResource.key}
            style={{ textDecoration: "none" }}
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
                cursor: "pointer",
                "&:hover": {
                  backgroundColor: theme.palette.grey[300],
                },
              }}
            >
              {currResource.name}
            </Box>
          </Link>
        );
      })}
    </Stack>
  );
}

interface UserEventsTableProps {
  userId?: string;
  searchTerm?: string;
  startDate?: number;
  endDate?: number;
}

export function UserEventsTable({
  userId,
  searchTerm: initialSearchTerm,
  startDate,
  endDate,
}: UserEventsTableProps) {
  const { workspace, messages: messagesResult, broadcasts, journeys } = useAppStorePick([
    "workspace",
    "messages", 
    "broadcasts",
    "journeys"
  ]);
  const theme = useTheme();
  
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || "");
  const [debouncedSearchTerm] = useDebounce(searchTerm, 300);
  
  const [state, setState] = useImmer<State>({
    query: {
      offset: 0,
      limit: 10,
      userId,
      searchTerm: debouncedSearchTerm || undefined,
      startDate,
      endDate,
    },
    previewEvent: null,
    selectedEventResources: [],
    isSidebarOpen: false,
  });

  const messages =
    messagesResult.type === CompletionStatus.Successful
      ? messagesResult.value
      : [];

  const eventsQuery = useEventsQuery(
    {
      ...state.query,
      searchTerm: debouncedSearchTerm || undefined,
    },
    {
      placeholderData: keepPreviousData,
    },
  );

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

  const onRefresh = useCallback(() => {
    setState((draft) => {
      draft.query.offset = 0;
    });
  }, [setState]);

  const columns = useMemo<ColumnDef<GetEventsResponseItem>[]>(() => [
    {
      id: "preview",
      cell: ({ row }) => <PreviewCell row={row} setState={setState} />,
    },
    {
      id: "userId",
      header: "User ID",
      accessorKey: "userId",
      cell: ({ row }) => <UserIdCell value={row.original.userId} />,
    },
    {
      id: "eventType",
      header: "Type",
      accessorKey: "eventType",
      cell: ({ row }) => <EventTypeCell value={row.original.eventType} />,
    },
    {
      id: "event",
      header: "Event",
      accessorKey: "event",
      cell: ({ row }) => <EventNameCell value={row.original.event} />,
    },
    {
      id: "traits",
      header: "Properties",
      accessorKey: "traits",
      cell: ({ row }) => <TraitsCell value={row.original.traits} />,
    },
    {
      id: "eventTime",
      header: "Event Time",
      accessorKey: "eventTime",
      cell: ({ row }) => <TimeCell timestamp={row.original.eventTime} />,
    },
    {
      id: "processingTime",
      header: "Processing Time",
      accessorKey: "processingTime",
      cell: ({ row }) => <TimeCell timestamp={row.original.processingTime} />,
    },
    {
      id: "messageId",
      header: "Message ID",
      accessorKey: "messageId",
      cell: ({ row }) => <MessageIdCell value={row.original.messageId} />,
    },
    {
      id: "relatedResources",
      header: "Related Resources",
      cell: ({ row }) => (
        <RelatedResourcesCell 
          value={row.original.traits} 
          messages={messages}
          broadcasts={broadcasts}
          journeys={journeys}
          theme={theme}
        />
      ),
    },
  ], [setState, messages, broadcasts, journeys, theme]);

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
        <Typography variant="h6">User Events</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            id="search"
            type="search"
            label="Search"
            size="small"
            sx={{ width: "300px" }}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          <Tooltip title="Refresh Results" placement="bottom-start">
            <IconButton
              onClick={onRefresh}
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