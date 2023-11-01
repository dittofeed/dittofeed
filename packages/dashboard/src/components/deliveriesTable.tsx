import { useTheme } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import axios, { AxiosResponse } from "axios";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  EphemeralRequestStatus,
  GetEventsRequest,
  GetEventsResponse,
  GetEventsResponseItem,
  SearchDeliveriesRequest,
  SearchDeliveriesResponse,
  SearchDeliveriesResponseItem,
} from "isomorphic-lib/src/types";
import React, { useCallback, useMemo } from "react";
import { pick } from "remeda/dist/commonjs/pick";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { shallow } from "zustand/shallow";

import { useAppStore, useAppStorePick } from "../lib/appStore";
import renderCell from "../lib/renderCell";

interface DeliveriesState {
  pageSize: number;
  page: number;
  totalRowCount: number;
  items: SearchDeliveriesResponseItem[];
  paginationRequest: EphemeralRequestStatus<Error>;
  cursor: string | null;
}

type PaginationModel = Pick<DeliveriesState, "page" | "pageSize">;

const baseColumn: Partial<GridColDef<GetEventsResponseItem>> = {
  flex: 1,
  sortable: false,
  filterable: false,
  renderCell,
};

interface DeliveriesActions {
  updateItems: (key: DeliveriesState["items"]) => void;
  updatePagination: (key: PaginationModel) => void;
  // FIXME remove total row count
  updateTotalRowCount: (key: DeliveriesState["totalRowCount"]) => void;
  updatePaginationRequest: (key: DeliveriesState["paginationRequest"]) => void;
  updateCursor: (key: DeliveriesState["cursor"]) => void;
}

type DeliveriesStore = DeliveriesState & DeliveriesActions;

export const useDeliveriesStore = create(
  immer<DeliveriesStore>((set) => ({
    pageSize: 10,
    page: 0,
    totalRowCount: 2,
    items: [],
    cursor: null,
    paginationRequest: {
      type: CompletionStatus.NotStarted,
    },
    updateItems: (items) =>
      set((state) => {
        state.items = items;
      }),
    updatePagination: (pagination) =>
      set((state) => {
        state.page = pagination.page;
        state.pageSize = pagination.pageSize;
      }),
    updatePaginationRequest: (request) =>
      set((state) => {
        state.paginationRequest = request;
      }),
    updateTotalRowCount: (totalRowCount) =>
      set((state) => {
        state.totalRowCount = totalRowCount;
      }),
    updateCursor: (cursor) =>
      set((state) => {
        state.cursor = cursor;
      }),
  }))
);

function useStorePick<K extends keyof DeliveriesStore>(
  params: K[]
): Pick<DeliveriesStore, K> {
  return useDeliveriesStore((store) => pick(store, params));
}

export function DeliveriesTable() {
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
    page,
    totalRowCount,
    updateItems,
    updatePagination,
    updatePaginationRequest,
    updateTotalRowCount,
    cursor,
    updateCursor,
  } = useStorePick([
    "items",
    "paginationRequest",
    "pageSize",
    "page",
    "totalRowCount",
    "updateItems",
    "updatePagination",
    "updatePaginationRequest",
    "updateTotalRowCount",
    "cursor",
    "updateCursor",
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
          cursor: cursor ?? undefined,
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
      // updateTotalRowCount(result.value.count);

      updatePaginationRequest({
        type: CompletionStatus.NotStarted,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, workspaceId, updateTotalRowCount, updateItems, apiBase]);

  return (
    <DataGrid
      rows={items}
      columns={[
        {
          field: "userId",
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
      ].map((c) => ({ ...baseColumn, ...c }))}
      pageSize={pageSize}
      pagination
      paginationMode="server"
      onPageChange={handlePageChange}
      onPageSizeChange={handlePageSizeChange}
    />
  );
}
