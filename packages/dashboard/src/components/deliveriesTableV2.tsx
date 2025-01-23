import {
  Computer,
  Home,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Drawer,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Select,
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
  useTheme,
} from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  Row,
  useReactTable,
} from "@tanstack/react-table";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  BroadcastResource,
  ChannelType,
  CompletionStatus,
  SavedJourneyResource,
  SearchDeliveriesRequest,
  SearchDeliveriesResponse,
  SearchDeliveriesResponseItem,
  WorkspaceResource,
} from "isomorphic-lib/src/types";
import { useCallback, useMemo } from "react";
import { Updater, useImmer } from "use-immer";

import { useAppStorePick } from "../lib/appStore";
import {
  defaultGetDeliveriesRequest,
  GetDeliveriesRequest,
  humanizeStatus,
} from "./deliveriesTable";
import EmailPreviewHeader from "./emailPreviewHeader";
import EmailPreviewBody from "./messages/emailPreview";
import { WebhookPreviewBody } from "./messages/webhookPreview";
import SmsPreviewBody from "./smsPreviewBody";
import TemplatePreview from "./templatePreview";

function TimeCell({ row }: { row: Row<Delivery> }) {
  const timestamp = row.original.sentAt;

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
            }).format(timestamp)}
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
            }).format(timestamp)}
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  );

  return (
    <Tooltip title={tooltipContent} placement="bottom-start" arrow>
      <Typography>
        {formatDistanceToNow(timestamp, { addSuffix: true })}
      </Typography>
    </Tooltip>
  );
}

type SortBy =
  | "from"
  | "to"
  | "status"
  | "originName"
  | "templateName"
  | "sentAt";

type SortDirection = "asc" | "desc";

interface State {
  previewMessageId: string | null;
  timeOption: TimeOption;
  query: {
    cursor: string | null;
    limit: number;
    sortBy: SortBy;
    sortDirection: SortDirection;
  };
}
interface BaseDelivery {
  messageId: string;
  userId: string;
  body: string;
  status: string;
  originId: string;
  originType: "broadcast" | "journey";
  originName: string;
  templateId: string;
  templateName: string;
  sentAt: number;
  updatedAt: number;
  from?: string;
  to?: string;
  subject?: string;
  replyTo?: string;
  snippet?: string;
}

interface EmailDelivery extends BaseDelivery {
  channel: typeof ChannelType.Email;
  from: string;
  to: string;
  subject: string;
  replyTo?: string;
  snippet: string;
}

interface SmsDelivery extends BaseDelivery {
  channel: typeof ChannelType.Sms;
  from?: undefined;
  to: string;
  subject?: undefined;
  replyTo?: undefined;
  snippet: string;
}

interface WebhookDelivery extends BaseDelivery {
  channel: typeof ChannelType.Webhook;
  from?: undefined;
  to?: undefined;
  subject?: undefined;
  replyTo?: undefined;
  snippet?: undefined;
}

type Delivery = EmailDelivery | SmsDelivery | WebhookDelivery;

function getOrigin({
  workspace,
  journeys,
  broadcasts,
  item,
}: {
  workspace: WorkspaceResource;
  item: SearchDeliveriesResponseItem;
  journeys: SavedJourneyResource[];
  broadcasts: BroadcastResource[];
}): Pick<Delivery, "originId" | "originType" | "originName"> | null {
  for (const broadcast of broadcasts) {
    if (broadcast.journeyId === item.journeyId) {
      return {
        originId: broadcast.id,
        originType: "broadcast",
        originName: broadcast.name,
      };
    }
  }
  for (const journey of journeys) {
    if (journey.id === item.journeyId) {
      return {
        originId: journey.id,
        originType: "journey",
        originName: journey.name,
      };
    }
  }
  return null;
}
type SetState = Updater<State>;

function PreviewCell({
  row,
  setState,
}: {
  row: Row<Delivery>;
  setState: SetState;
}) {
  return (
    <Stack
      alignItems="center"
      sx={{
        height: "100%",
      }}
    >
      <IconButton
        size="small"
        onClick={() => {
          setState((draft) => {
            draft.previewMessageId = row.original.messageId;
          });
        }}
      >
        <VisibilityIcon sx={{ color: "#262626", cursor: "pointer" }} />
      </IconButton>
    </Stack>
  );
}

function renderPreviewCellFactory(setState: SetState) {
  return function renderPreviewCell({ row }: { row: Row<Delivery> }) {
    return <PreviewCell row={row} setState={setState} />;
  };
}

interface MinuteTimeOption {
  type: "minutes";
  id: string;
  minutes: number;
  label: string;
}

interface CustomTimeOption {
  type: "custom";
  id: string;
  label: string;
}

type TimeOption = MinuteTimeOption | CustomTimeOption;

const defaultTimeOption: TimeOption = {
  type: "minutes",
  id: "last-7-days",
  minutes: 10080,
  label: "Last 7 days",
};

const timeOptions: TimeOption[] = [
  { type: "minutes", id: "last-hour", minutes: 60, label: "Last hour" },
  {
    type: "minutes",
    id: "last-24-hours",
    minutes: 1440,
    label: "Last 24 hours",
  },
  defaultTimeOption,
  {
    type: "minutes",
    id: "last-30-days",
    minutes: 43200,
    label: "Last 30 days",
  },
  { type: "custom", id: "custom", label: "Custom Date Range" },
];

export function DeliveriesTableV2({
  getDeliveriesRequest = defaultGetDeliveriesRequest,
}: {
  getDeliveriesRequest?: GetDeliveriesRequest;
}) {
  const { workspace, apiBase, messages, journeys, broadcasts } =
    useAppStorePick([
      "workspace",
      "messages",
      "apiBase",
      "journeys",
      "broadcasts",
    ]);

  const [state, setState] = useImmer<State>({
    previewMessageId: null,
    timeOption: defaultTimeOption,
    query: {
      cursor: null,
      limit: 10,
      sortBy: "sentAt",
      sortDirection: "desc",
    },
  });
  const theme = useTheme();
  const query = useQuery<SearchDeliveriesResponse | null>({
    queryKey: ["deliveries", state],
    queryFn: async () => {
      if (workspace.type !== CompletionStatus.Successful) {
        return null;
      }
      const params: SearchDeliveriesRequest = {
        workspaceId: workspace.value.id,
        cursor: state.query.cursor ?? undefined,
        limit: state.query.limit,
      };
      const response = await getDeliveriesRequest({
        params,
        apiBase,
      });
      const result = unwrap(
        schemaValidateWithErr(response.data, SearchDeliveriesResponse),
      );
      return result;
    },
    placeholderData: keepPreviousData,
  });

  const renderPreviewCell = useMemo(
    () => renderPreviewCellFactory(setState),
    [setState],
  );

  const columns = useMemo<ColumnDef<Delivery>[]>(
    () => [
      {
        id: "preview",
        cell: renderPreviewCell,
      },
      {
        header: "From",
        accessorKey: "from",
      },
      {
        header: "To",
        accessorKey: "to",
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => humanizeStatus(row.original.status),
      },
      {
        header: "Origin",
        accessorKey: "originName",
      },
      {
        header: "Template",
        accessorKey: "templateName",
      },
      {
        header: "Sent At",
        accessorKey: "sentAt",
        cell: TimeCell,
      },
      {
        header: "Updated At",
        accessorKey: "updatedAt",
        cell: TimeCell,
      },
    ],
    [renderPreviewCell],
  );
  const data = useMemo<Delivery[] | null>(() => {
    if (
      query.isPending ||
      !query.data ||
      workspace.type !== CompletionStatus.Successful ||
      journeys.type !== CompletionStatus.Successful ||
      messages.type !== CompletionStatus.Successful
    ) {
      return null;
    }
    return query.data.items.flatMap((item) => {
      const origin = getOrigin({
        workspace: workspace.value,
        journeys: journeys.value,
        broadcasts,
        item,
      });
      if (origin === null) {
        return [];
      }
      const template = messages.value.find(
        (message) => message.id === item.templateId,
      );
      if (template === undefined) {
        return [];
      }
      if (!("variant" in item)) {
        return [];
      }
      const { variant } = item;
      const baseDelivery: Omit<
        Delivery,
        "channel" | "body" | "snippet" | "subject" | "to" | "from" | "replyTo"
      > = {
        messageId: item.originMessageId,
        userId: item.userId,
        status: item.status,
        originId: origin.originId,
        originType: origin.originType,
        originName: origin.originName,
        templateId: template.id,
        templateName: template.name,
        sentAt: new Date(item.sentAt).getTime(),
        updatedAt: new Date(item.updatedAt).getTime(),
      };

      let delivery: Delivery;
      switch (variant.type) {
        case ChannelType.Email:
          delivery = {
            ...baseDelivery,
            channel: ChannelType.Email,
            body: variant.body,
            snippet: variant.subject,
            subject: variant.subject,
            to: variant.to,
            from: variant.from,
            replyTo: variant.replyTo,
          };
          break;
        case ChannelType.Sms:
          delivery = {
            ...baseDelivery,
            channel: ChannelType.Sms,
            body: variant.body,
            snippet: variant.body,
            to: variant.to,
          };
          break;
        case ChannelType.Webhook:
          delivery = {
            ...baseDelivery,
            channel: ChannelType.Webhook,
            body: JSON.stringify(
              { request: variant.request, response: variant.response },
              null,
              2,
            ),
          };
          break;
        default:
          assertUnreachable(variant);
      }
      return delivery;
    });
  }, [query, workspace, journeys, broadcasts, messages]);

  const onNextPage = useCallback(() => {
    setState((draft) => {
      if (query.data?.cursor) {
        draft.query.cursor = query.data.cursor;
      }
    });
  }, [setState, query.data]);

  const onPreviousPage = useCallback(() => {
    setState((draft) => {
      if (query.data?.previousCursor) {
        draft.query.cursor = query.data.previousCursor;
      }
    });
  }, [setState, query.data]);

  const table = useReactTable({
    columns,
    data: data ?? [],
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const previewObject = useMemo(() => {
    if (state.previewMessageId === null) {
      return null;
    }
    return (
      data?.find((delivery) => delivery.messageId === state.previewMessageId) ??
      null
    );
  }, [state.previewMessageId, data]);

  let preview: React.ReactNode = null;
  if (previewObject !== null) {
    let previewHeader: React.ReactNode;
    let previewBody: React.ReactNode;
    switch (previewObject.channel) {
      case ChannelType.Email:
        previewHeader = (
          <EmailPreviewHeader
            email={previewObject.to}
            from={previewObject.from}
            subject={previewObject.subject}
          />
        );
        previewBody = (
          <Box sx={{ padding: theme.spacing(1), height: "100%" }}>
            <EmailPreviewBody body={previewObject.body} />
          </Box>
        );
        break;
      case ChannelType.Sms:
        previewHeader = null;
        previewBody = <SmsPreviewBody body={previewObject.body} />;
        break;
      case ChannelType.Webhook:
        previewHeader = null;
        previewBody = <WebhookPreviewBody body={previewObject.body} />;
        break;
      default:
        assertUnreachable(previewObject);
    }
    preview = (
      <TemplatePreview
        previewHeader={previewHeader}
        previewBody={previewBody}
        visibilityHandler={
          <IconButton
            size="medium"
            onClick={() =>
              setState((draft) => {
                draft.previewMessageId = null;
              })
            }
          >
            <VisibilityOffIcon />
          </IconButton>
        }
        bodyPreviewHeading="Delivery Preview"
      />
    );
  }

  if (query.isPending || data === null) {
    return null;
  }
  return (
    <>
      <Stack
        spacing={1}
        sx={{
          width: "100%",
          height: "100%",
        }}
      >
        <Box>
          <FormControl>
            <Select
              value={state.timeOption.id}
              MenuProps={{
                anchorOrigin: {
                  vertical: "bottom",
                  horizontal: "left",
                },
                transformOrigin: {
                  vertical: "top",
                  horizontal: "left",
                },
                sx: {
                  "& .MuiMenuItem-root": {
                    color: "grey.700",
                    fontWeight: "bold",
                    "&:hover": { bgcolor: "grey.300" },
                    "&:active": { bgcolor: "grey.300" },
                  },
                  "&& .Mui-selected": {
                    bgcolor: "grey.300",
                  },
                },
              }}
              sx={{
                "& .MuiOutlinedInput-notchedOutline": {
                  borderColor: "grey.400",
                },
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: "grey.400",
                },
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: "grey.400",
                },
                "& .MuiSelect-select": {
                  fontWeight: "bold",
                },
              }}
              onChange={(e) =>
                setState((draft) => {
                  const option = timeOptions.find(
                    (o) => o.id === e.target.value,
                  );
                  if (option === undefined) {
                    return;
                  }
                  draft.timeOption = option;
                })
              }
              size="small"
            >
              {timeOptions.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

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
                bgcolor: "background.paper",
              }}
            >
              <TableRow>
                <TableCell colSpan={table.getAllColumns().length}>
                  <Stack
                    direction="row"
                    spacing={2}
                    justifyContent="flex-end"
                    alignItems="center"
                  >
                    <Button
                      color="inherit"
                      onClick={onPreviousPage}
                      disabled={query.data?.previousCursor === undefined}
                      startIcon={<KeyboardArrowLeft />}
                      sx={{
                        bgcolor: "grey.200",
                        color: "grey.700",
                        "&:hover": {
                          bgcolor: "grey.300",
                        },
                        "&:active": {
                          bgcolor: "grey.400",
                        },
                        "&.Mui-disabled": {
                          bgcolor: "grey.100",
                          color: "grey.400",
                        },
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      onClick={onNextPage}
                      disabled={query.data?.cursor === undefined}
                      endIcon={<KeyboardArrowRight />}
                      sx={{
                        bgcolor: "grey.200",
                        color: "grey.700",
                        "&:hover": {
                          bgcolor: "grey.300",
                        },
                        "&:active": {
                          bgcolor: "grey.400",
                        },
                        "&.Mui-disabled": {
                          bgcolor: "grey.100",
                          color: "grey.400",
                        },
                      }}
                    >
                      Next
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      </Stack>
      <Drawer
        open={state.previewMessageId !== null}
        onClose={() => {
          setState((draft) => {
            draft.previewMessageId = null;
          });
        }}
        anchor="bottom"
        sx={{
          zIndex: "2000",
          "& .MuiDrawer-paper": {
            height: "100vh",
            width: "100vw",
          },
        }}
      >
        {preview}
      </Drawer>
    </>
  );
}
