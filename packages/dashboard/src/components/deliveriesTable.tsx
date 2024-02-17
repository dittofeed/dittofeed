import {
  ArrowBackIosNewOutlined,
  ArrowForwardIosOutlined,
} from "@mui/icons-material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import {
  Button,
  Drawer,
  IconButton,
  Stack,
  Tooltip,
  useTheme,
} from "@mui/material";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import axios, { AxiosResponse } from "axios";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  ChannelType,
  CompletionStatus,
  EphemeralRequestStatus,
  SearchDeliveriesRequest,
  SearchDeliveriesResponse,
  SearchDeliveriesResponseItem,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import { useRouter } from "next/router";
import { ParsedUrlQuery } from "querystring";
import React, { useState } from "react";
import { omit } from "remeda/dist/commonjs/omit";
import { pick } from "remeda/dist/commonjs/pick";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { useAppStorePick } from "../lib/appStore";
import { LinkCell, monospaceCell } from "../lib/datagridCells";
import { getTemplatesLink } from "../lib/templatesLink";
import EmailPreviewHeader from "./emailPreviewHeader";
import SmsPreviewBody from "./smsPreviewBody";
import TemplatePreview from "./templatePreview";

interface TableItem {
  userId: string;
  to: string;
  sentAt: string;
  updatedAt: string;
  originType: "broadcast" | "journey";
  originName: string;
  originId: string;
  status: string;
  id: string;
  templateId?: string;
  templateName?: string;
  channel: ChannelType;
  body: string | null;
  from: string | null | undefined;
  subject: string | null | undefined;
  replyTo: string | null | undefined;
}

interface DeliveriesState {
  pageSize: number;
  items: Map<string, SearchDeliveriesResponseItem>;
  paginationRequest: EphemeralRequestStatus<Error>;
}

interface PreviewObjectInterface {
  subject: string | null | undefined;
  from: string | null | undefined;
  replyTo: string | null | undefined;
  to: string;
  body: string | null;
  show: boolean;
  channelType: string;
}

const initPreviewObject = () => {
  return {
    subject: "",
    from: "",
    replyTo: "",
    to: "",
    body: "",
    show: false,
    channelType: "",
  };
};

const baseColumn: Partial<GridColDef<TableItem>> = {
  flex: 1,
  sortable: false,
  filterable: false,
  renderCell: monospaceCell,
};

interface DeliveriesActions {
  upsertItems: (key: SearchDeliveriesResponseItem[]) => void;
  updatePaginationRequest: (key: DeliveriesState["paginationRequest"]) => void;
  onPageSizeChange: (pageSize: number) => void;
}
function ButtonLinkCell({ href, value }: { href: string; value: string }) {
  return (
    <Tooltip title={value}>
      <Link
        style={{
          width: "100%",
          textDecoration: "none",
          color: "inherit",
        }}
        href={href}
      >
        <Button
          sx={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
          }}
          variant="outlined"
        >
          {value}
        </Button>
      </Link>
    </Tooltip>
  );
}

type DeliveriesStore = DeliveriesState & DeliveriesActions;

export const useDeliveriesStore = create(
  immer<DeliveriesStore>((set) => ({
    pageSize: 10,
    page: 0,
    items: new Map(),
    paginationRequest: {
      type: CompletionStatus.NotStarted,
    },
    upsertItems: (items) =>
      set((state) => {
        for (const item of items) {
          state.items.set(item.originMessageId, item);
        }
      }),
    updatePaginationRequest: (request) =>
      set((state) => {
        state.paginationRequest = request;
      }),
    onPageSizeChange: (pageSize) =>
      set((state) => {
        state.pageSize = pageSize;
      }),
  })),
);

function useStorePick<K extends keyof DeliveriesStore>(
  params: K[],
): Pick<DeliveriesStore, K> {
  return useDeliveriesStore((store) => pick(store, params));
}

const QUERY_PARAMETERS = {
  PREVIOUS_CURSOR: "pdc",
  CURRENT_CURSOR: "cdc",
  NEXT_CURSOR: "ndc",
} as const;

function getQueryValue(query: ParsedUrlQuery, key: string): string | undefined {
  const val = query[key];
  if (Array.isArray(val)) {
    return val[0];
  }
  if (val && val.length === 0) {
    return undefined;
  }
  return val;
}

export function DeliveriesTable({
  journeyId,
  userId,
}: Pick<SearchDeliveriesRequest, "journeyId" | "userId">) {
  const [pageItems, setPageItems] = React.useState(new Set<string>());
  const [previewObject, setPreviewObject] =
    useState<PreviewObjectInterface>(initPreviewObject());
  const router = useRouter();
  const theme = useTheme();

  const previousCursor = getQueryValue(
    router.query,
    QUERY_PARAMETERS.PREVIOUS_CURSOR,
  );
  const currentCursor = getQueryValue(
    router.query,
    QUERY_PARAMETERS.CURRENT_CURSOR,
  );
  const nextCursor = getQueryValue(router.query, QUERY_PARAMETERS.NEXT_CURSOR);

  const { workspace, apiBase, messages, journeys, broadcasts } =
    useAppStorePick([
      "workspace",
      "messages",
      "apiBase",
      "journeys",
      "broadcasts",
    ]);

  const {
    items,
    paginationRequest,
    pageSize,
    upsertItems,
    updatePaginationRequest,
  } = useStorePick([
    "items",
    "paginationRequest",
    "pageSize",
    "upsertItems",
    "updatePaginationRequest",
    "onPageSizeChange",
  ]);
  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null;

  React.useEffect(() => {
    (async () => {
      if (
        !workspaceId ||
        paginationRequest.type === CompletionStatus.InProgress
      ) {
        return;
      }

      updatePaginationRequest({
        type: CompletionStatus.InProgress,
      });
      let response: AxiosResponse;
      try {
        const params: SearchDeliveriesRequest = {
          workspaceId,
          cursor: currentCursor,
          limit: pageSize,
          journeyId,
          userId,
        };

        response = await axios.get(`${apiBase}/api/deliveries`, {
          params,
        });
      } catch (e) {
        const error = e as Error;

        updatePaginationRequest({
          type: CompletionStatus.Failed,
          error,
        });
        return;
      }
      const result = schemaValidate(response.data, SearchDeliveriesResponse);
      if (result.isErr()) {
        console.error("unable parse response", result.error);

        updatePaginationRequest({
          type: CompletionStatus.Failed,
          error: new Error(JSON.stringify(result.error)),
        });
        return;
      }

      upsertItems(result.value.items);
      setPageItems(new Set(result.value.items.map((i) => i.originMessageId)));

      let updateQuery = false;
      const query: ParsedUrlQuery = {
        ...router.query,
      };
      if (result.value.cursor) {
        updateQuery = true;
        query[QUERY_PARAMETERS.NEXT_CURSOR] = result.value.cursor;
      }

      if (result.value.previousCursor) {
        updateQuery = true;
        query[QUERY_PARAMETERS.PREVIOUS_CURSOR] = result.value.previousCursor;
      }

      if (updateQuery) {
        router.push({
          pathname: router.pathname,
          query,
        });
      }

      updatePaginationRequest({
        type: CompletionStatus.NotStarted,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, currentCursor]);

  const rows: TableItem[] = React.useMemo(
    () =>
      Array.from(pageItems).flatMap((pageItem) => {
        const item = items.get(pageItem);
        if (!item) {
          return [];
        }
        let origin: Pick<
          TableItem,
          "originName" | "originType" | "originId"
        > | null = null;
        let template: Pick<TableItem, "templateId" | "templateName"> | null =
          null;
        for (const broadcast of broadcasts) {
          if (broadcast.journeyId === item.journeyId) {
            origin = {
              originName: broadcast.name,
              originType: "broadcast",
              originId: broadcast.id,
            };
            template = {
              templateId: broadcast.messageTemplateId,
            };
            break;
          }
        }
        if (!origin) {
          const journeyValue =
            journeys.type === CompletionStatus.Successful ? journeys.value : [];
          for (const journey of journeyValue) {
            if (journey.id === item.journeyId) {
              origin = {
                originName: journey.name,
                originType: "journey",
                originId: journey.id,
              };
              break;
            }
          }
        }

        if (!origin) {
          return [];
        }

        const messagesValue =
          messages.type === CompletionStatus.Successful ? messages.value : [];
        for (const message of messagesValue) {
          if (message.id === item.templateId) {
            template = {
              templateId: message.id,
              templateName: message.name,
            };
            break;
          }
        }

        if (!template && origin.originType !== "broadcast") {
          return [];
        }

        let to: string | null = null;
        let channel: ChannelType | null = null;
        let body: string | null = null;
        let from: string | null | undefined = null;
        let subject: string | null | undefined = null;
        let replyTo: string | null | undefined = null;
        if ("variant" in item) {
          to = item.variant.to;
          channel = item.variant.type;
          body = item.variant.body;

          if (item.variant.type === ChannelType.Email) {
            from = item.variant.from;
            subject = item.variant.subject;
            replyTo = item.variant.replyTo;
          }
        } else {
          to = item.to;
          from = item.from;
          subject = item.subject;
          replyTo = item.replyTo;
          channel = item.channel;
          body = item.body ?? null;
        }
        if (!to || !channel) {
          return [];
        }
        const tableItem: TableItem = {
          id: item.originMessageId,
          sentAt: item.sentAt,
          updatedAt: item.updatedAt,
          userId: item.userId,
          to,
          from,
          subject,
          replyTo,
          status: item.status,
          channel,
          body,
          ...origin,
          ...template,
        };
        return tableItem;
      }),
    [items, pageItems],
  );

  const renderEmailPreviewBody = (body: string) => {
    return (
      <iframe
        srcDoc={`<!DOCTYPE html>${body ?? ""}`}
        title="email-body-preview"
        style={{
          border: "none",
          height: "100%",
          width: "100%",
          padding: theme.spacing(1),
        }}
      />
    );
  };

  const renderSmsPreviewBody = (body: string) => {
    return <SmsPreviewBody body={body} />;
  };

  const renderPreviewBody = (po: PreviewObjectInterface) => {
    if (!po.body) return null;
    if (po.channelType === "Email") {
      return renderEmailPreviewBody(po.body);
    }

    return renderSmsPreviewBody(po.body);
  };

  const renderEmailPreviewHeader = (po: PreviewObjectInterface) => {
    return (
      <EmailPreviewHeader
        email={po.to}
        from={po.from}
        subject={po.subject}
        replyTo={po.replyTo}
      />
    );
  };

  const renderPreviewHeader = (po: PreviewObjectInterface) => {
    if (po.channelType === "Email") {
      return renderEmailPreviewHeader(po);
    }
    return null;
  };

  const getPreviewVisibilityHandler = () => {
    return (
      <VisibilityOffIcon
        fontSize="small"
        onClick={() => setPreviewObject(initPreviewObject())}
        sx={{ cursor: "pointer" }}
      />
    );
  };

  const preview = (
    <TemplatePreview
      previewHeader={renderPreviewHeader(previewObject)}
      previewBody={renderPreviewBody(previewObject)}
      visibilityHandler={getPreviewVisibilityHandler()}
      bodyPreviewHeading="Delivery Preview"
    />
  );

  return (
    <>
      <Stack sx={{ width: "100%" }} spacing={1}>
        <DataGrid
          rows={rows}
          loading={paginationRequest.type === CompletionStatus.InProgress}
          columns={[
            {
              field: "userId",
              headerName: "User ID",
              renderCell: ({ row }: GridRenderCellParams<TableItem>) => {
                const href = `/users/${row.userId}`;
                return <LinkCell href={href} title={row.userId} />;
              },
            },
            {
              field: "to",
              headerName: "To",
              renderCell: ({ row }: GridRenderCellParams<TableItem>) => {
                const href = `/users/${row.userId}`;
                return <LinkCell href={href} title={row.to} />;
              },
            },
            {
              field: "status",
              headerName: "Status",
            },
            {
              field: "originId",
              flex: 1,
              headerName: "Journey / Broadcast",
              renderCell: ({ row }: GridRenderCellParams<TableItem>) => {
                const href =
                  row.originType === "broadcast"
                    ? `/broadcasts/review/${row.originId}`
                    : `/journeys/configure/${row.originId}`;
                return <ButtonLinkCell href={href} value={row.originName} />;
              },
            },
            {
              field: "templateId",
              headerName: "Template",
              renderCell: ({ row }: GridRenderCellParams<TableItem>) => {
                const href =
                  row.originType === "broadcast"
                    ? `/broadcasts/template/${row.originId}`
                    : getTemplatesLink({
                        channel: row.channel,
                        id: row.originId,
                      });
                let value: string;
                if (!row.templateName) {
                  if (row.originType !== "broadcast") {
                    return null;
                  }
                  value = "Broadcast Template";
                } else {
                  value = row.templateName;
                }
                return <ButtonLinkCell href={href} value={value} />;
              },
            },
            {
              field: "sentAt",
              headerName: "Sent At",
            },
            {
              field: "updatedAt",
              headerName: "Updated At",
            },
            {
              field: "Preview",
              headerName: "Preview",
              renderCell: ({ row }: GridRenderCellParams<TableItem>) => {
                return (
                  <VisibilityIcon
                    sx={{ color: "#262626", cursor: "pointer" }}
                    onClick={() => {
                      setPreviewObject({
                        body: row.body,
                        show: true,
                        channelType: row.channel,
                        subject: row.subject,
                        from: row.from,
                        to: row.to,
                        replyTo: row.replyTo,
                      });
                    }}
                    fontSize="small"
                  />
                );
              },
            },
          ].map((c) => ({ ...baseColumn, ...c }))}
          pagination
          paginationMode="server"
          pageSizeOptions={[pageSize]}
          autoHeight
          hideFooter
        />
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="flex-end"
          spacing={1}
        >
          <IconButton
            disabled={!currentCursor}
            onClick={() => {
              router.push({
                pathname: router.pathname,
                query: {
                  ...omit(router.query, [QUERY_PARAMETERS.PREVIOUS_CURSOR]),
                  [QUERY_PARAMETERS.CURRENT_CURSOR]: previousCursor,
                  [QUERY_PARAMETERS.NEXT_CURSOR]: currentCursor,
                },
              });
            }}
          >
            <ArrowBackIosNewOutlined />
          </IconButton>
          <IconButton
            disabled={!nextCursor}
            onClick={() => {
              const query = {
                ...omit(router.query, [QUERY_PARAMETERS.NEXT_CURSOR]),
                [QUERY_PARAMETERS.PREVIOUS_CURSOR]: currentCursor,
                [QUERY_PARAMETERS.CURRENT_CURSOR]: nextCursor,
              };
              router.push({
                pathname: router.pathname,
                query,
              });
            }}
          >
            <ArrowForwardIosOutlined />
          </IconButton>
        </Stack>
      </Stack>
      <Drawer
        open={previewObject.show}
        onClose={() => {
          setPreviewObject(initPreviewObject());
        }}
        anchor="bottom"
        sx={{
          zIndex: "2000",
        }}
      >
        {preview}
      </Drawer>
    </>
  );
}
