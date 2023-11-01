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
  SearchDeliveriesResponseItem,
} from "isomorphic-lib/src/types";
import React, { useMemo } from "react";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { shallow } from "zustand/shallow";

import { useAppStore } from "../lib/appStore";
import renderCell from "../lib/renderCell";

interface DeliveriesState {
  pageSize: number;
  page: number;
  totalRowCount: number;
  items: SearchDeliveriesResponseItem[];
  paginationRequest: EphemeralRequestStatus<Error>;
}

type PaginationModel = Pick<DeliveriesState, "page" | "pageSize">;

interface DeliveriesActions {
  updateItems: (key: DeliveriesState["items"]) => void;
  updatePagination: (key: PaginationModel) => void;
  updateTotalRowCount: (key: DeliveriesState["totalRowCount"]) => void;
  updatePaginationRequest: (key: DeliveriesState["paginationRequest"]) => void;
}

type DeliveriesStore = DeliveriesState & DeliveriesActions;

export const useDeliveriesStore = create(
  immer<DeliveriesStore>((set) => ({
    pageSize: 10,
    page: 0,
    totalRowCount: 2,
    items: [],
    paginationRequest: {
      type: CompletionStatus.NotStarted,
    },
    updateItems: (events) =>
      set((state) => {
        state.items = events;
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
  }))
);

export function DeliveriesTable() {
  return <>Deliveries</>;
}
