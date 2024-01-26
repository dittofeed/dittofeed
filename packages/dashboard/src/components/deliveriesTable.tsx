import {
  ArrowBackIosNewOutlined,
  ArrowForwardIosOutlined,
} from "@mui/icons-material";
import { Button, IconButton, Stack, Tooltip } from "@mui/material";
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
import React from "react";
import { omit } from "remeda/dist/commonjs/omit";
import { pick } from "remeda/dist/commonjs/pick";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { useAppStorePick } from "../lib/appStore";
import { LinkCell, monospaceCell } from "../lib/datagridCells";
import { getTemplatesLink } from "../lib/templatesLink";

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
}

interface DeliveriesState {
  pageSize: number;
  items: Map<string, SearchDeliveriesResponseItem>;
  paginationRequest: EphemeralRequestStatus<Error>;
}

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
  const router = useRouter();
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
        if ("variant" in item) {
          to = item.variant.to;
          channel = item.variant.type;
        } else {
          to = item.to;
          channel = item.channel;
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
          status: item.status,
          channel,
          ...origin,
          ...template,
        };
        return tableItem;
      }),
    [items, pageItems],
  );

  return (
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
  );
}
