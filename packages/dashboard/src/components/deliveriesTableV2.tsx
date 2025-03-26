import { CalendarDate } from "@internationalized/date";
import {
  ArrowDownward as ArrowDownwardIcon,
  ArrowUpward as ArrowUpwardIcon,
  Bolt as BoltIcon,
  Clear as ClearIcon,
  Computer,
  ContentCopy as ContentCopyIcon,
  Home,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  OpenInNew,
  Refresh as RefreshIcon,
  SwapVert as SwapVertIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  ButtonProps,
  CircularProgress,
  Divider,
  Drawer,
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
import { subDays, subMinutes } from "date-fns";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  BroadcastResource,
  ChannelType,
  CompletionStatus,
  DeliveriesAllowedColumn,
  SavedJourneyResource,
  SearchDeliveriesRequest,
  SearchDeliveriesRequestSortBy,
  SearchDeliveriesRequestSortByEnum,
  SearchDeliveriesResponse,
  SearchDeliveriesResponseItem,
  SortDirection,
  SortDirectionEnum,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import uriTemplates from "uri-templates";
import { Updater, useImmer } from "use-immer";

import { useAppStorePick } from "../lib/appStore";
import { toCalendarDate } from "../lib/dates";
import {
  getFilterValues,
  NewDeliveriesFilterButton,
  SelectedDeliveriesFilters,
  useDeliveriesFilterState,
} from "./deliveries/deliveriesFilter";
import {
  defaultGetDeliveriesRequest,
  GetDeliveriesRequest,
  humanizeStatus,
} from "./deliveriesTable";
import EmailPreviewHeader from "./emailPreviewHeader";
import { greyMenuItemStyles, greySelectStyles } from "./greyScaleStyles";
import EmailPreviewBody from "./messages/emailPreview";
import { WebhookPreviewBody } from "./messages/webhookPreview";
import { RangeCalendar } from "./rangeCalendar";
import SmsPreviewBody from "./smsPreviewBody";
import TemplatePreview from "./templatePreview";

export const DEFAULT_ALLOWED_COLUMNS: DeliveriesAllowedColumn[] = [
  "preview",
  "from",
  "to",
  "userId",
  "channel",
  "status",
  "origin",
  "template",
  "sentAt",
];

function getSortByLabel(sortBy: SearchDeliveriesRequestSortBy): string {
  switch (sortBy) {
    case SearchDeliveriesRequestSortByEnum.sentAt:
      return "Sent At";
    case SearchDeliveriesRequestSortByEnum.from:
      return "From";
    case SearchDeliveriesRequestSortByEnum.to:
      return "To";
    case SearchDeliveriesRequestSortByEnum.status:
      return "Status";
    case SearchDeliveriesRequestSortByEnum.userId:
      return "User ID";
    default:
      assertUnreachable(sortBy);
  }
}

function humanizeChannel(channel: ChannelType): string {
  switch (channel) {
    case ChannelType.Email:
      return "Email";
    case ChannelType.Sms:
      return "SMS";
    case ChannelType.Webhook:
      return "Webhook";
    case ChannelType.MobilePush:
      return "Mobile Push";
  }
}

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

export const greyButtonStyle = {
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
} as const;

function GreyButton(props: ButtonProps) {
  const { sx, ...rest } = props;
  return (
    <Button
      {...rest}
      sx={{
        ...greyButtonStyle,
        ...sx,
      }}
    />
  );
}

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

  const formatted = formatDistanceToNow(timestamp, { addSuffix: true });
  return (
    <Tooltip title={tooltipContent} placement="bottom-start" arrow>
      <Typography>{formatted}</Typography>
    </Tooltip>
  );
}

function LinkCell({
  row,
  column,
  uriTemplate,
}: {
  row: Row<Delivery>;
  column: ColumnDef<Delivery>;
  uriTemplate?: string;
}) {
  const value = column.id ? (row.getValue(column.id) as string) : null;
  const uri = useMemo(() => {
    if (!uriTemplate) {
      return null;
    }
    const template = uriTemplates(uriTemplate);
    const values: Record<string, string> = {
      userId: row.original.userId,
      messageId: row.original.messageId,
      templateId: row.original.templateId,
      channel: row.original.channel.toLowerCase(),
    };
    if (row.original.originId) {
      values.originId = row.original.originId;
    }
    if (row.original.originType) {
      values.originType = row.original.originType;
    }
    if (row.original.originName) {
      values.originName = row.original.originName;
    }
    if (row.original.templateName) {
      values.templateName = row.original.templateName;
    }
    return template.fillFromObject(values);
  }, [
    uriTemplate,
    row.original.userId,
    row.original.messageId,
    row.original.originId,
    row.original.templateId,
    row.original.channel,
    row.original.originType,
    row.original.originName,
    row.original.templateName,
  ]);

  if (!value) {
    return null;
  }
  return (
    <Tooltip title={value} placement="bottom-start">
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{
          maxWidth: "280px",
        }}
      >
        <Box
          sx={{
            maxWidth: "calc(100% - 32px);",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {value}
        </Box>
        {uri && (
          <IconButton LinkComponent={Link} href={uri} target="_blank">
            <OpenInNew />
          </IconButton>
        )}
      </Stack>
    </Tooltip>
  );
}

function linkCellFactory(uriTemplate?: string) {
  return function linkCell({
    row,
    column,
  }: {
    row: Row<Delivery>;
    column: ColumnDef<Delivery>;
  }) {
    return <LinkCell row={row} column={column} uriTemplate={uriTemplate} />;
  };
}

interface State {
  previewMessageId: string | null;
  selectedTimeOption: string;
  referenceDate: Date;
  customDateRange: {
    start: CalendarDate;
    end: CalendarDate;
  } | null;
  query: {
    cursor: string | null;
    limit: number;
    sortBy: SearchDeliveriesRequestSortBy;
    sortDirection: SortDirection;
    startDate: Date;
    endDate: Date;
  };
  autoReload: boolean;
}

interface BaseDelivery {
  messageId: string;
  userId: string;
  body: string;
  status: string;
  originId?: string;
  originType?: "broadcast" | "journey";
  originName?: string;
  templateId: string;
  templateName?: string;
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
  journeys,
  broadcasts,
  item,
}: {
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

function SnippetCell({ row }: { row: Row<Delivery> }) {
  return (
    <Tooltip title={row.original.snippet} placement="bottom-start">
      <Typography
        variant="subtitle2"
        color="text.secondary"
        sx={{
          maxWidth: "480px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {row.original.snippet}
      </Typography>
    </Tooltip>
  );
}

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
      <Tooltip title="View Delivery Contents">
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
      </Tooltip>
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
  { type: "custom", id: "custom", label: "Custom Date Range" },
];

export const DEFAULT_DELIVERIES_TABLE_V2_PROPS: DeliveriesTableV2Props = {
  userUriTemplate: "/users/{userId}",
  templateUriTemplate: "/templates/{channel}/{templateId}",
  originUriTemplate: "/{originType}s/{originId}",
  columnAllowList: DEFAULT_ALLOWED_COLUMNS,
  autoReloadByDefault: false,
  reloadPeriodMs: 30000,
};

interface DeliveriesTableV2Props {
  getDeliveriesRequest?: GetDeliveriesRequest;
  userUriTemplate?: string;
  templateUriTemplate?: string;
  originUriTemplate?: string;
  columnAllowList?: DeliveriesAllowedColumn[];
  userId?: string[] | string;
  groupId?: string[] | string;
  journeyId?: string;
  autoReloadByDefault?: boolean;
  reloadPeriodMs?: number;
}

function UserIdCell({
  value,
  userUriTemplate,
}: {
  value: string;
  userUriTemplate: string;
}) {
  const [showCopied, setShowCopied] = useState(false);
  const uri = userUriTemplate.replace("{userId}", value);

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

function userIdCellFactory(userUriTemplate?: string) {
  return function UserIdCellRenderer({ row }: { row: Row<Delivery> }) {
    return (
      <UserIdCell
        value={row.original.userId}
        userUriTemplate={userUriTemplate ?? "/users/{userId}"}
      />
    );
  };
}

export function DeliveriesTableV2({
  getDeliveriesRequest = defaultGetDeliveriesRequest,
  userUriTemplate,
  templateUriTemplate,
  originUriTemplate,
  userId,
  groupId,
  columnAllowList,
  journeyId,
  autoReloadByDefault = false,
  reloadPeriodMs = 30000,
}: DeliveriesTableV2Props) {
  const { workspace, apiBase, messages, journeys, broadcasts } =
    useAppStorePick([
      "workspace",
      "messages",
      "apiBase",
      "journeys",
      "broadcasts",
    ]);

  const [deliveriesFilterState, setDeliveriesFilterState] =
    useDeliveriesFilterState();
  const initialEndDate = useMemo(() => new Date(), []);
  const initialStartDate = useMemo(
    () => subMinutes(initialEndDate, defaultTimeOption.minutes),
    [initialEndDate],
  );

  const [state, setState] = useImmer<State>({
    previewMessageId: null,
    selectedTimeOption: defaultTimeOption.id,
    referenceDate: new Date(),
    customDateRange: null,
    query: {
      cursor: null,
      limit: 10,
      startDate: initialStartDate,
      endDate: initialEndDate,
      sortBy: "sentAt",
      sortDirection: SortDirectionEnum.Desc,
    },
    autoReload: autoReloadByDefault,
  });
  const theme = useTheme();
  const filtersHash = useMemo(
    () => JSON.stringify(Array.from(deliveriesFilterState.filters.entries())),
    [deliveriesFilterState.filters],
  );
  const query = useQuery<SearchDeliveriesResponse | null>({
    queryKey: ["deliveries", state, filtersHash],
    queryFn: async () => {
      if (workspace.type !== CompletionStatus.Successful) {
        return null;
      }

      const templateIds = getFilterValues(deliveriesFilterState, "template");
      const channels = getFilterValues(deliveriesFilterState, "channel") as
        | ChannelType[]
        | undefined;
      const to = getFilterValues(deliveriesFilterState, "to");
      const statuses = getFilterValues(deliveriesFilterState, "status");
      const from = getFilterValues(deliveriesFilterState, "from");

      const params: SearchDeliveriesRequest = {
        workspaceId: workspace.value.id,
        cursor: state.query.cursor ?? undefined,
        limit: state.query.limit,
        startDate: state.query.startDate.toISOString(),
        endDate: state.query.endDate.toISOString(),
        templateIds,
        channels,
        to,
        statuses,
        from,
        sortBy: state.query.sortBy,
        sortDirection: state.query.sortDirection,
        userId,
        groupId,
        journeyId,
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
    refetchInterval:
      state.autoReload && state.selectedTimeOption !== "custom"
        ? reloadPeriodMs
        : false,
  });

  const renderPreviewCell = useMemo(
    () => renderPreviewCellFactory(setState),
    [setState],
  );
  const templateLinkCell = useMemo(
    () => linkCellFactory(templateUriTemplate),
    [templateUriTemplate],
  );
  const originLinkCell = useMemo(
    () => linkCellFactory(originUriTemplate),
    [originUriTemplate],
  );

  const userIdCellRenderer = useMemo(
    () => userIdCellFactory(userUriTemplate),
    [userUriTemplate],
  );

  const columns = useMemo<ColumnDef<Delivery>[]>(() => {
    const columnDefinitions: Record<
      DeliveriesAllowedColumn,
      ColumnDef<Delivery>
    > = {
      preview: {
        id: "preview",
        cell: renderPreviewCell,
      },
      from: {
        id: "from",
        header: "From",
        accessorKey: "from",
      },
      to: {
        id: "to",
        header: "To",
        accessorKey: "to",
        cell: linkCellFactory(),
      },
      userId: {
        id: "userId",
        header: "User ID",
        accessorKey: "userId",
        cell: userIdCellRenderer,
      },
      snippet: {
        id: "snippet",
        header: "Snippet",
        accessorKey: "snippet",
        cell: SnippetCell,
      },
      channel: {
        id: "channel",
        header: "Channel",
        accessorKey: "channel",
        cell: ({ row }) => humanizeChannel(row.original.channel),
      },
      status: {
        id: "status",
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => humanizeStatus(row.original.status),
      },
      origin: {
        id: "origin",
        header: "Origin",
        accessorKey: "originName",
        cell: originLinkCell,
      },
      template: {
        id: "template",
        header: "Template",
        accessorKey: "templateName",
        cell: templateLinkCell,
      },
      sentAt: {
        id: "sentAt",
        header: "Sent At",
        accessorKey: "sentAt",
        cell: TimeCell,
      },
      updatedAt: {
        id: "updatedAt",
        header: "Updated At",
        accessorKey: "updatedAt",
        cell: TimeCell,
      },
    };

    if (!columnAllowList) {
      return Object.values(columnDefinitions);
    }

    return columnAllowList.map((columnId) => columnDefinitions[columnId]);
  }, [
    renderPreviewCell,
    templateLinkCell,
    originLinkCell,
    columnAllowList,
    userUriTemplate,
    userIdCellRenderer,
  ]);
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
        journeys: journeys.value,
        broadcasts,
        item,
      });
      const template = messages.value.find(
        (message) => message.id === item.templateId,
      );
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
        originId: origin?.originId,
        originType: origin?.originType,
        originName: origin?.originName,
        templateId: item.templateId,
        templateName: template?.name,
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
  const customDateRef = useRef<HTMLInputElement | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

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

  const onFirstPage = useCallback(() => {
    setState((draft) => {
      draft.query.cursor = null;
    });
  }, [setState]);

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

  return (
    <>
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
          spacing={1}
          sx={{ width: "100%", height: "48px" }}
        >
          <FormControl>
            <Select
              value={state.selectedTimeOption}
              renderValue={(value) => {
                const option = timeOptions.find((o) => o.id === value);
                if (option?.type === "custom") {
                  return `${formatDate(state.query.startDate)} - ${formatDate(state.query.endDate)}`;
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
                  );
                  draft.query.endDate = draft.referenceDate;
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
                            draft.query.startDate =
                              draft.customDateRange.start.toDate(
                                Intl.DateTimeFormat().resolvedOptions()
                                  .timeZone,
                              );
                            draft.query.endDate =
                              draft.customDateRange.end.toDate(
                                Intl.DateTimeFormat().resolvedOptions()
                                  .timeZone,
                              );

                            draft.customDateRange = null;
                            draft.selectedTimeOption = "custom";
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
          <Divider
            orientation="vertical"
            flexItem
            sx={{ borderColor: "grey.300" }}
          />
          <Stack direction="row" spacing={1} flex={1} sx={{ height: "100%" }}>
            <NewDeliveriesFilterButton
              state={deliveriesFilterState}
              setState={setDeliveriesFilterState}
              greyScale
              buttonProps={{
                disableRipple: true,
                sx: {
                  ...greyButtonStyle,
                  fontWeight: "bold",
                },
              }}
            />
            <SelectedDeliveriesFilters
              state={deliveriesFilterState}
              setState={setDeliveriesFilterState}
              sx={{
                height: "100%",
              }}
            />
          </Stack>
          {(state.query.sortBy !== "sentAt" ||
            state.query.sortDirection !== SortDirectionEnum.Desc) && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                border: "1px solid",
                borderColor: "grey.400",
                borderRadius: 1,
                pl: 1,
                pr: 1,
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ pt: 1, pb: 1 }}
              >
                {getSortByLabel(state.query.sortBy)}
                {state.query.sortDirection === SortDirectionEnum.Asc ? (
                  <ArrowUpwardIcon fontSize="small" />
                ) : (
                  <ArrowDownwardIcon fontSize="small" />
                )}
              </Stack>
              <IconButton
                size="small"
                onClick={() => {
                  setState((draft) => {
                    draft.query.sortBy = "sentAt";
                    draft.query.sortDirection = SortDirectionEnum.Desc;
                    draft.query.cursor = null;
                  });
                }}
              >
                <ClearIcon />
              </IconButton>
            </Stack>
          )}
          <GreyButton
            startIcon={<SwapVertIcon />}
            sx={{
              border: "1px solid",
              borderColor: "grey.400",
              backgroundColor: "white",
            }}
            onClick={(e) => {
              setAnchorEl(e.currentTarget);
            }}
          >
            Sort
          </GreyButton>
          <Popover
            open={Boolean(anchorEl)}
            anchorEl={anchorEl}
            slotProps={{
              paper: {
                elevation: 3,
                sx: {
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "grey.400",
                  p: 2,
                },
              },
            }}
            onClose={() => {
              setAnchorEl(null);
            }}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "right",
            }}
            transformOrigin={{
              vertical: "top",
              horizontal: "right",
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="center"
              spacing={1}
            >
              <Select
                value={state.query.sortBy}
                sx={greySelectStyles}
                onChange={(e) => {
                  setState((draft) => {
                    draft.query.sortBy = e.target
                      .value as SearchDeliveriesRequestSortBy;
                    draft.query.cursor = null;
                  });
                }}
                MenuProps={{
                  sx: greyMenuItemStyles,
                  anchorOrigin: {
                    vertical: "bottom",
                    horizontal: "right",
                  },
                  transformOrigin: {
                    vertical: "top",
                    horizontal: "right",
                  },
                }}
              >
                <MenuItem value={SearchDeliveriesRequestSortByEnum.sentAt}>
                  {getSortByLabel(SearchDeliveriesRequestSortByEnum.sentAt)}
                </MenuItem>
                <MenuItem value={SearchDeliveriesRequestSortByEnum.from}>
                  {getSortByLabel(SearchDeliveriesRequestSortByEnum.from)}
                </MenuItem>
                <MenuItem value={SearchDeliveriesRequestSortByEnum.to}>
                  {getSortByLabel(SearchDeliveriesRequestSortByEnum.to)}
                </MenuItem>
                <MenuItem value={SearchDeliveriesRequestSortByEnum.status}>
                  {getSortByLabel(SearchDeliveriesRequestSortByEnum.status)}
                </MenuItem>
              </Select>
              <Select
                value={state.query.sortDirection}
                sx={greySelectStyles}
                onChange={(e) => {
                  setState((draft) => {
                    draft.query.sortDirection = e.target.value as SortDirection;
                    draft.query.cursor = null;
                  });
                }}
                MenuProps={{
                  sx: greyMenuItemStyles,
                  anchorOrigin: {
                    vertical: "bottom",
                    horizontal: "right",
                  },
                  transformOrigin: {
                    vertical: "top",
                    horizontal: "right",
                  },
                }}
              >
                <MenuItem value={SortDirectionEnum.Asc}>Asc</MenuItem>
                <MenuItem value={SortDirectionEnum.Desc}>Desc</MenuItem>
              </Select>
            </Stack>
          </Popover>
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
                  draft.query.cursor = null;
                  const endDate = new Date();
                  draft.query.endDate = endDate;
                  draft.query.startDate = subMinutes(endDate, option.minutes);
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
          <Tooltip
            title={`Auto refresh every ${Math.floor(reloadPeriodMs / 1000)} seconds`}
            placement="bottom-start"
          >
            <IconButton
              disabled={state.selectedTimeOption === "custom"}
              onClick={() => {
                setState((draft) => {
                  draft.autoReload = !draft.autoReload;
                });
              }}
              sx={{
                border: "1px solid",
                borderColor: "grey.400",
                bgcolor: state.autoReload ? "grey.600" : "inherit",
                color: state.autoReload ? "white" : "inherit",
                "&:hover": {
                  bgcolor: state.autoReload ? "grey.700" : undefined,
                },
              }}
            >
              <BoltIcon />
            </IconButton>
          </Tooltip>
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
                        disabled={query.data?.previousCursor === undefined}
                        startIcon={<KeyboardDoubleArrowLeft />}
                      >
                        First
                      </GreyButton>
                      <GreyButton
                        onClick={onPreviousPage}
                        disabled={query.data?.previousCursor === undefined}
                        startIcon={<KeyboardArrowLeft />}
                      >
                        Previous
                      </GreyButton>
                      <GreyButton
                        onClick={onNextPage}
                        disabled={query.data?.cursor === undefined}
                        endIcon={<KeyboardArrowRight />}
                      >
                        Next
                      </GreyButton>
                    </Stack>
                    <Box
                      sx={{
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {query.isFetching && (
                        <CircularProgress color="inherit" size={20} />
                      )}
                    </Box>
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
