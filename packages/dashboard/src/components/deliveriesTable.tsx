import { Box, Button, Tooltip } from "@mui/material";
import {
  DataGrid,
  GridColDef,
  GridPaginationModel,
  GridRenderCellParams,
} from "@mui/x-data-grid";
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
import renderCell from "../lib/renderCell";
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
  items: SearchDeliveriesResponseItem[];
  paginationRequest: EphemeralRequestStatus<Error>;
}

const baseColumn: Partial<GridColDef<TableItem>> = {
  flex: 1,
  sortable: false,
  filterable: false,
  renderCell,
};

interface DeliveriesActions {
  updateItems: (key: DeliveriesState["items"]) => void;
  updatePaginationRequest: (key: DeliveriesState["paginationRequest"]) => void;
  onPageSizeChange: (pageSize: number) => void;
}
function LinkCell({ href, value }: { href: string; value: string }) {
  return (
    <Tooltip title={value}>
      <Link
        style={{
          width: "100%",
          textDecoration: "none",
          color: "inherit",
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        href={href}
      >
        {value}
      </Link>
    </Tooltip>
  );
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
    items: [],
    paginationRequest: {
      type: CompletionStatus.NotStarted,
    },
    updateItems: (items) =>
      set((state) => {
        state.items = items;
      }),
    updatePaginationRequest: (request) =>
      set((state) => {
        state.paginationRequest = request;
      }),
    onPageSizeChange: (pageSize) =>
      set((state) => {
        state.pageSize = pageSize;
      }),
  }))
);

function useStorePick<K extends keyof DeliveriesStore>(
  params: K[]
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
  if (val) {
    return val[0];
  }
  return val;
}

export function DeliveriesTable() {
  const [page, setPage] = React.useState(0);
  const router = useRouter();
  const previousCursor = getQueryValue(
    router.query,
    QUERY_PARAMETERS.PREVIOUS_CURSOR
  );
  const currentCursor = getQueryValue(
    router.query,
    QUERY_PARAMETERS.CURRENT_CURSOR
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
    updateItems,
    updatePaginationRequest,
  } = useStorePick([
    "items",
    "paginationRequest",
    "pageSize",
    "updateItems",
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

      updateItems(result.value.items);

      if (result.value.cursor) {
        router.push({
          pathname: router.pathname,
          query: {
            ...router.query,
            [QUERY_PARAMETERS.NEXT_CURSOR]: result.value.cursor,
          },
        });
      }

      if (result.value.previousCursor) {
        router.push({
          pathname: router.pathname,
          query: {
            ...router.query,
            [QUERY_PARAMETERS.PREVIOUS_CURSOR]: result.value.previousCursor,
          },
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
      items.flatMap((item) => {
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
        if (!to) {
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
    [items]
  );

  return (
    <Box sx={{ width: "100%" }}>
      <DataGrid
        rows={rows}
        columns={[
          {
            field: "userId",
            headerName: "User ID",
            renderCell: ({ row }: GridRenderCellParams<TableItem>) => {
              const href = `/users/${row.userId}`;
              return <LinkCell href={href} value={row.userId} />;
            },
          },
          {
            field: "to",
            headerName: "To",
            renderCell: ({ row }: GridRenderCellParams<TableItem>) => {
              const href = `/users/${row.userId}`;
              return <LinkCell href={href} value={row.to} />;
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
        paginationModel={{
          pageSize,
          page,
        }}
        rowCount={nextCursor ? Number.MAX_VALUE : pageSize * (page + 1)}
        onPaginationModelChange={(newPaginationModel: GridPaginationModel) => {
          if (newPaginationModel.page > page) {
            const query = {
              ...omit(router.query, [QUERY_PARAMETERS.NEXT_CURSOR]),
              [QUERY_PARAMETERS.PREVIOUS_CURSOR]: currentCursor,
              [QUERY_PARAMETERS.CURRENT_CURSOR]: nextCursor,
            };
            router.push({
              pathname: router.pathname,
              query,
            });
          } else {
            router.push({
              pathname: router.pathname,
              query: {
                ...omit(router.query, [QUERY_PARAMETERS.PREVIOUS_CURSOR]),
                [QUERY_PARAMETERS.CURRENT_CURSOR]: previousCursor,
                [QUERY_PARAMETERS.NEXT_CURSOR]: currentCursor,
              },
            });
          }
          setPage(newPaginationModel.page);
        }}
        sx={{
          ".MuiTablePagination-displayedRows": {
            display: "none", // 👈 to hide huge pagination number
          },
        }}
      />
    </Box>
  );
}
