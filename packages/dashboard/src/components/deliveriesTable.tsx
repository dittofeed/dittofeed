import { DataGrid, GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import axios, { AxiosResponse } from "axios";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  EphemeralRequestStatus,
  SearchDeliveriesRequest,
  SearchDeliveriesResponse,
  SearchDeliveriesResponseItem,
} from "isomorphic-lib/src/types";
import React from "react";
import { pick } from "remeda/dist/commonjs/pick";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { useAppStorePick } from "../lib/appStore";
import renderCell from "../lib/renderCell";
import { useRouter } from "next/router";
import { omit } from "remeda/dist/commonjs/omit";

interface TableItem {
  userId: string;
  to: string;
  sentAt: string;
  updatedAt: string;
  originType: "broadcast" | "journey";
  originName: string;
  status: string;
  id: string;
  templateId: string;
  templateName: string;
}

interface DeliveriesState {
  pageSize: number;
  items: SearchDeliveriesResponseItem[];
  paginationRequest: EphemeralRequestStatus<Error>;
}

const baseColumn: Partial<GridColDef<SearchDeliveriesResponseItem>> = {
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

export function DeliveriesTable() {
  const [page, setPage] = React.useState(0);
  const router = useRouter();
  const {
    [QUERY_PARAMETERS.PREVIOUS_CURSOR]: previousCursor,
    [QUERY_PARAMETERS.CURRENT_CURSOR]: currentCursor,
    [QUERY_PARAMETERS.NEXT_CURSOR]: nextCursor,
  } = router.query;
  if (
    (previousCursor && typeof previousCursor !== "string") ||
    (currentCursor && typeof currentCursor !== "string") ||
    (nextCursor && typeof nextCursor !== "string")
  ) {
    return null;
  }

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

      const itemsWithId = result.value.items.map((item) => ({
        ...item,
        id: item.originMessageId,
      }));
      updateItems(itemsWithId);

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

  return (
    <DataGrid
      rows={items}
      columns={[
        {
          field: "sentAt",
        },
        {
          field: "updatedAt",
        },
        {
          field: "to",
        },
        {
          field: "journeyId",
        },
        {
          field: "userId",
        },
        {
          field: "originMessageId",
        },
        {
          field: "status",
        },
        {
          field: "channel",
        },
      ].map((c) => ({ ...baseColumn, ...c }))}
      pagination
      paginationMode="server"
      pageSizeOptions={[pageSize]}
      paginationModel={{
        pageSize: pageSize,
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
  );
}
