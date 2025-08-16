import {
  Computer,
  ContentCopy as ContentCopyIcon,
  Home,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  OpenInNew,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from "@mui/icons-material";
import {
  Box,
  ButtonProps,
  CircularProgress,
  Drawer,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  SxProps,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  Theme,
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
import axios from "axios";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import { isInternalBroadcastTemplate } from "isomorphic-lib/src/broadcasts";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  BroadcastResourceAllVersions,
  BroadcastResourceVersionEnum,
  BroadcastStepKeys,
  ChannelType,
  CompletionStatus,
  DeliveriesAllowedColumn,
  JSONValue,
  MinimalJourneysResource,
  SearchDeliveriesRequest,
  SearchDeliveriesRequestSortBy,
  SearchDeliveriesRequestSortByEnum,
  SearchDeliveriesResponse,
  SearchDeliveriesResponseItem,
  SortDirection,
  SortDirectionEnum,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import qs from "qs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { omit } from "remeda";
import uriTemplates from "uri-templates";
import { Updater, useImmer } from "use-immer";

import { useAppStorePick } from "../../lib/appStore";
import { useAuthHeaders, useBaseApiUrl } from "../../lib/authModeProvider";
import { expandCascadingMessageFilters } from "../../lib/cascadingMessageFilters";
import { useBroadcastsQuery } from "../../lib/useBroadcastsQuery";
import { useResourcesQuery } from "../../lib/useResourcesQuery";
import { BroadcastQueryKeys } from "../broadcasts/broadcastsShared";
import { humanizeStatus } from "../deliveriesTable";
import EmailPreviewHeader from "../emailPreviewHeader";
import { GreyButton } from "../greyButtonStyle";
import EmailPreviewBody from "../messages/emailPreview";
import { WebhookPreviewBody } from "../messages/webhookPreview";
import SmsPreviewBody from "../smsPreviewBody";
import TemplatePreview from "../templatePreview";
import { DEFAULT_ALLOWED_COLUMNS } from "./constants";

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

type QueryParams = Record<string, JSONValue>;

function renderRowUrl({
  uriTemplate,
  delivery,
  queryParams,
}: {
  uriTemplate?: string;
  delivery: Delivery;
  queryParams?: QueryParams;
}): string | null {
  if (!uriTemplate) {
    return null;
  }
  const template = uriTemplates(uriTemplate);

  const values: Record<string, string> = {
    userId: delivery.userId,
    messageId: delivery.messageId,
    templateId: delivery.templateId,
    channel: delivery.channel.toLowerCase(),
  };
  if (delivery.originId) {
    values.originId = delivery.originId;
  }
  if (delivery.originType) {
    values.originType = delivery.originType;
  }
  if (delivery.originName) {
    values.originName = delivery.originName;
  }
  if (delivery.templateName) {
    values.templateName = delivery.templateName;
  }
  let uriWithoutQueryParams = template.fillFromObject(values);
  if (queryParams && Object.keys(queryParams).length > 0) {
    uriWithoutQueryParams = `${uriWithoutQueryParams}?${qs.stringify(queryParams)}`;
  }
  return uriWithoutQueryParams;
}

type RenderUrl = (row: Delivery) => string | null;

function LinkCell({
  row,
  column,
  renderUrl,
}: {
  row: Row<Delivery>;
  column: ColumnDef<Delivery>;
  renderUrl?: RenderUrl;
}) {
  const value = column.id ? (row.getValue(column.id) as string) : null;
  const uri = useMemo(() => {
    return renderUrl ? renderUrl(row.original) : null;
  }, [renderUrl, row.original]);

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
          maxWidth: "200px",
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

function linkCellFactory(renderUrl?: RenderUrl) {
  return function linkCell({
    row,
    column,
  }: {
    row: Row<Delivery>;
    column: ColumnDef<Delivery>;
  }) {
    return <LinkCell row={row} column={column} renderUrl={renderUrl} />;
  };
}

function maxWidthCellFactory() {
  return function maxWidthCell({ row }: { row: Row<Delivery> }) {
    return (
      <Box
        sx={{
          maxWidth: "200px",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {row.original.from}
      </Box>
    );
  };
}

interface BaseDelivery {
  messageId: string;
  userId: string;
  body: string;
  status: string;
  originId?: string;
  originType?: "broadcast" | "journey" | "broadcastV2";
  originName?: string;
  broadcastId?: string;
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
  journeys: MinimalJourneysResource[];
  broadcasts: BroadcastResourceAllVersions[];
}): Pick<Delivery, "originId" | "originType" | "originName"> | null {
  for (const broadcast of broadcasts) {
    if (
      (!broadcast.version ||
        broadcast.version === BroadcastResourceVersionEnum.V1) &&
      broadcast.journeyId &&
      broadcast.journeyId === item.journeyId
    ) {
      return {
        originId: broadcast.id,
        originType: "broadcast",
        originName: broadcast.name,
      };
    }
    if (
      broadcast.version === BroadcastResourceVersionEnum.V2 &&
      broadcast.messageTemplateId === item.templateId
    ) {
      return {
        originId: broadcast.id,
        originType: "broadcastV2",
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

export interface DeliveriesBodyState {
  previewMessageId: string | null;
  cursor: string | null;
}

export type SetDeliveriesBodyState = Updater<DeliveriesBodyState>;

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
  setState: SetDeliveriesBodyState;
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

function renderPreviewCellFactory(setState: SetDeliveriesBodyState) {
  return function renderPreviewCell({ row }: { row: Row<Delivery> }) {
    return <PreviewCell row={row} setState={setState} />;
  };
}

function UserIdCell({ value }: { value: string }) {
  const [showCopied, setShowCopied] = useState(false);
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

function userIdCellFactory() {
  return function UserIdCellRenderer({ row }: { row: Row<Delivery> }) {
    return <UserIdCell value={row.original.userId} />;
  };
}

export interface DeliveriesBodyHookProps {
  userId?: string[] | string;
  groupId?: string[] | string;
  journeyId?: string;
  journeyIds?: string[];
  triggeringProperties?: SearchDeliveriesRequest["triggeringProperties"];
  contextValues?: SearchDeliveriesRequest["contextValues"];
  broadcastId?: string;
  broadcastIds?: string[];
  templateIds?: string[];
  channels?: ChannelType[];
  to?: string[];
  statuses?: string[];
  from?: string[];
  startDate: string;
  endDate: string;
  sortBy?: SearchDeliveriesRequestSortBy;
  sortDirection?: SortDirection;
  limit?: number;
}

export interface DeliveriesBodyProps extends DeliveriesBodyHookProps {
  templateUriTemplate?: string;
  originUriTemplate?: string;
  columnAllowList?: DeliveriesAllowedColumn[];
  broadcastUriTemplate?: string;
  state: DeliveriesBodyState;
  setState: SetDeliveriesBodyState;
  headerCellSx?: SxProps<Theme>;
  footerRowSx?: SxProps<Theme>;
  footerCellSx?: SxProps<Theme>;
  footerCellButtonProps?: ButtonProps;
}

export function useDeliveryBodyState({
  userId,
  groupId,
  journeyId,
  journeyIds,
  triggeringProperties,
  contextValues,
  broadcastId,
  broadcastIds,
  templateIds,
  channels,
  to,
  statuses,
  from,
  startDate,
  endDate,
  sortBy = "sentAt",
  sortDirection = SortDirectionEnum.Desc,
  limit = 10,
}: DeliveriesBodyHookProps) {
  const { workspace } = useAppStorePick(["workspace"]);
  const baseApiUrl = useBaseApiUrl();
  const authHeaders = useAuthHeaders();
  const { data: resources } = useResourcesQuery({
    journeys: true,
    messageTemplates: true,
  });
  const { data: broadcasts } = useBroadcastsQuery();

  const [state, setState] = useImmer<DeliveriesBodyState>({
    previewMessageId: null,
    cursor: null,
  });

  // Reset pagination when date range or sort changes
  useEffect(() => {
    setState((draft) => {
      if (draft.cursor) {
        draft.cursor = null;
      }
    });
  }, [startDate, endDate, sortBy, sortDirection, setState]);

  const filtersHash = useMemo(
    () =>
      JSON.stringify({
        templateIds,
        channels,
        to,
        statuses,
        from,
        journeyIds,
        broadcastIds,
      }),
    [templateIds, channels, to, statuses, from, journeyIds, broadcastIds],
  );

  const resolvedQueryParams = useMemo(() => {
    if (workspace.type !== CompletionStatus.Successful) {
      return null;
    }

    // Apply cascading logic to statuses
    const expandedStatuses = statuses
      ? expandCascadingMessageFilters(statuses)
      : undefined;

    // For now, use the first journey/broadcast ID if arrays are provided
    // TODO: Update backend to support arrays of journey and broadcast IDs
    const resolvedJourneyId =
      journeyId ||
      (journeyIds && journeyIds.length > 0 ? journeyIds[0] : undefined);
    const resolvedBroadcastId =
      broadcastId ||
      (broadcastIds && broadcastIds.length > 0 ? broadcastIds[0] : undefined);

    return {
      workspaceId: workspace.value.id,
      cursor: state.cursor ?? undefined,
      limit,
      startDate,
      endDate,
      templateIds,
      channels,
      to,
      statuses: expandedStatuses,
      from,
      triggeringProperties,
      contextValues,
      sortBy,
      sortDirection,
      userId,
      groupId,
      journeyId: resolvedJourneyId,
      broadcastId: resolvedBroadcastId,
    } satisfies SearchDeliveriesRequest;
  }, [
    workspace,
    statuses,
    journeyId,
    journeyIds,
    broadcastId,
    broadcastIds,
    state.cursor,
    limit,
    startDate,
    endDate,
    templateIds,
    channels,
    to,
    from,
    triggeringProperties,
    contextValues,
    sortBy,
    sortDirection,
    userId,
    groupId,
  ]);

  const query = useQuery<SearchDeliveriesResponse | null>({
    queryKey: [
      "deliveries",
      state,
      filtersHash,
      userId,
      groupId,
      journeyId,
      triggeringProperties,
      contextValues,
      workspace,
      sortBy,
      sortDirection,
      startDate,
      endDate,
    ],
    queryFn: async () => {
      if (!resolvedQueryParams) {
        return null;
      }
      const response = await axios.get(`${baseApiUrl}/deliveries`, {
        params: resolvedQueryParams,
        headers: authHeaders,
      });
      const result = unwrap(
        schemaValidateWithErr(response.data, SearchDeliveriesResponse),
      );
      return result;
    },
    placeholderData: keepPreviousData,
  });

  const data = useMemo<Delivery[] | null>(() => {
    if (
      !query.data ||
      !resources ||
      !broadcasts ||
      workspace.type !== CompletionStatus.Successful
    ) {
      return null;
    }
    return query.data.items.flatMap((item) => {
      const origin = getOrigin({
        journeys: resources.journeys ?? [],
        broadcasts,
        item,
      });
      const template = (resources.messageTemplates ?? []).find(
        (messageTemplate) => messageTemplate.id === item.templateId,
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
        broadcastId: item.broadcastId,
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
  }, [query, workspace, resources, broadcasts]);

  const onNextPage = useCallback(() => {
    setState((draft) => {
      if (query.data?.cursor) {
        draft.cursor = query.data.cursor;
      }
    });
  }, [setState, query.data]);

  const onPreviousPage = useCallback(() => {
    setState((draft) => {
      if (query.data?.previousCursor) {
        draft.cursor = query.data.previousCursor;
      }
    });
  }, [setState, query.data]);

  const onFirstPage = useCallback(() => {
    setState((draft) => {
      draft.cursor = null;
    });
  }, [setState]);

  return {
    state,
    setState,
    data,
    query,
    onNextPage,
    onPreviousPage,
    onFirstPage,
  };
}

export function DeliveriesBody({
  templateUriTemplate,
  originUriTemplate,
  columnAllowList = DEFAULT_ALLOWED_COLUMNS,
  broadcastUriTemplate,
  state,
  setState,
  headerCellSx,
  footerCellSx,
  footerCellButtonProps,
  footerRowSx,
  ...hookProps
}: DeliveriesBodyProps) {
  const { data, query, onNextPage, onPreviousPage, onFirstPage } =
    useDeliveryBodyState(hookProps);

  const { workspace } = useAppStorePick(["workspace"]);

  const theme = useTheme();

  const renderPreviewCell = useMemo(
    () => renderPreviewCellFactory(setState),
    [setState],
  );
  const templateLinkCell = useMemo(
    () =>
      linkCellFactory((delivery) => {
        const isInternalTemplate =
          delivery.broadcastId &&
          workspace.type === CompletionStatus.Successful &&
          isInternalBroadcastTemplate({
            templateId: delivery.templateId,
            broadcastId: delivery.broadcastId,
            workspaceId: workspace.value.id,
          });

        let uriTemplate: string | undefined;
        const queryParams: QueryParams = {};
        if (delivery.originType !== "broadcastV2" || !isInternalTemplate) {
          uriTemplate = templateUriTemplate;
        } else {
          uriTemplate = broadcastUriTemplate;
          if (delivery.broadcastId) {
            queryParams.id = delivery.broadcastId;
          }
          queryParams[BroadcastQueryKeys.STEP] = BroadcastStepKeys.CONTENT;
        }
        return renderRowUrl({
          uriTemplate,
          delivery,
          queryParams,
        });
      }),
    [workspace, templateUriTemplate, broadcastUriTemplate],
  );
  const originLinkCell = useMemo(
    () =>
      linkCellFactory((delivery) => {
        let uriTemplate: string | undefined;
        const queryParams: QueryParams = {};
        if (delivery.originType === "broadcastV2") {
          uriTemplate = broadcastUriTemplate;
          if (delivery.broadcastId) {
            queryParams.id = delivery.broadcastId;
          }
          queryParams[BroadcastQueryKeys.STEP] = BroadcastStepKeys.DELIVERIES;
        } else {
          uriTemplate = originUriTemplate;
        }
        return renderRowUrl({
          uriTemplate,
          delivery,
          queryParams,
        });
      }),
    [originUriTemplate, broadcastUriTemplate],
  );
  const maxWidthCell = useMemo(() => maxWidthCellFactory(), []);

  const userIdCellRenderer = useMemo(() => userIdCellFactory(), []);

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
        cell: maxWidthCell,
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
    maxWidthCell,
    userIdCellRenderer,
    originLinkCell,
    templateLinkCell,
    columnAllowList,
  ]);

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
        <TableContainer component={Paper}>
          <Table stickyHeader>
            <TableHead>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableCell
                      key={header.id}
                      colSpan={header.colSpan}
                      sx={headerCellSx}
                    >
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
              <TableRow sx={footerRowSx}>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  sx={{
                    bgcolor: "background.paper",
                    borderTop: "1px solid",
                    borderColor: "grey.100",
                    ...footerCellSx,
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
                        {...footerCellButtonProps}
                      >
                        First
                      </GreyButton>
                      <GreyButton
                        onClick={onPreviousPage}
                        disabled={query.data?.previousCursor === undefined}
                        startIcon={<KeyboardArrowLeft />}
                        {...footerCellButtonProps}
                      >
                        Previous
                      </GreyButton>
                      <GreyButton
                        onClick={onNextPage}
                        disabled={query.data?.cursor === undefined}
                        endIcon={<KeyboardArrowRight />}
                        {...footerCellButtonProps}
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

// Export utilities that parent components need for download buttons
export { getSortByLabel };

// Export function to create download params
export function createDownloadParams(
  resolvedQueryParams: Record<string, unknown> | null,
) {
  if (!resolvedQueryParams) return null;
  return omit(resolvedQueryParams, ["cursor", "limit"]);
}
