import { KeyboardArrowLeft, KeyboardArrowRight } from "@mui/icons-material";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import {
  DataGrid,
  GridColDef,
  GridSlotsComponentsProps,
} from "@mui/x-data-grid";
import { Type } from "@sinclair/typebox";
import {
  CompletionStatus,
  CursorDirectionEnum,
  EphemeralRequestStatus,
  GetUsersRequest,
  GetUsersResponse,
  GetUsersResponseItem,
} from "isomorphic-lib/src/types";
import { NextRouter } from "next/router";
import React, { useMemo } from "react";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import renderCell from "../lib/renderCell";

export const UsersTableParams = Type.Pick(GetUsersRequest, [
  "cursor",
  "direction",
]);

export function usersTablePaginationHandler(router: NextRouter) {
  const onUsersTablePaginate = ({
    direction,
    cursor,
  }: OnPaginationChangeProps) => {
    router.push({
      pathname: router.pathname,
      query: {
        ...router.query,
        direction,
        cursor,
      },
    });
  };
  return onUsersTablePaginate;
}

interface Row {
  id: string;
  properties: string;
  segments: string;
}

const baseColumn: Partial<GridColDef<Row>> = {
  flex: 1,
  sortable: false,
  filterable: false,
  renderCell: (params) =>
    renderCell(params, {
      href: (row) => `/users/${row.id}`,
    }),
};

declare module "@mui/x-data-grid" {
  interface FooterPropsOverrides {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    onNextPage: () => void;
    onPreviousPage: () => void;
    status: "a" | "b";
  }
}

function CustomPagination(props: GridSlotsComponentsProps["footer"]) {
  const { hasNextPage, hasPreviousPage, onNextPage, onPreviousPage } =
    props ?? {};

  return (
    <Box display="flex" justifyContent="center" alignItems="center">
      <IconButton disabled={!hasPreviousPage} onClick={onPreviousPage}>
        <KeyboardArrowLeft />
      </IconButton>
      <IconButton disabled={!hasNextPage} onClick={onNextPage}>
        <KeyboardArrowRight />
      </IconButton>
    </Box>
  );
}

interface UsersState {
  users: Record<string, GetUsersResponseItem>;
  currentPageUserIds: string[];
  getUsersRequest: EphemeralRequestStatus<Error>;
  previousCursor: string | null;
  nextCursor: string | null;
}

interface UsersActions {
  setUsers: (val: GetUsersResponseItem[]) => void;
  setUsersPage: (val: string[]) => void;
  setGetUsersRequest: (val: EphemeralRequestStatus<Error>) => void;
  setPreviousCursor: (val: string | null) => void;
  setNextCursor: (val: string | null) => void;
}

export const usersStore = create(
  immer<UsersState & UsersActions>((set) => ({
    users: {},
    currentPageUserIds: [],
    getUsersRequest: {
      type: CompletionStatus.NotStarted,
    },
    nextCursor: null,
    previousCursor: null,
    setUsers: (users) =>
      set((state) => {
        for (const user of users) {
          state.users[user.id] = user;
        }
      }),
    setUsersPage: (ids) =>
      set((state) => {
        state.currentPageUserIds = ids;
      }),
    setGetUsersRequest: (request) =>
      set((state) => {
        state.getUsersRequest = request;
      }),
    setPreviousCursor: (cursor) =>
      set((state) => {
        state.previousCursor = cursor;
      }),
    setNextCursor: (cursor) =>
      set((state) => {
        state.nextCursor = cursor;
      }),
  }))
);

export type OnPaginationChangeProps = Pick<
  GetUsersRequest,
  "direction" | "cursor"
>;

export type UsersTableProps = Omit<GetUsersRequest, "limit"> & {
  onPaginationChange: (args: OnPaginationChangeProps) => void;
};

export default function UsersTable({
  workspaceId,
  segmentId,
  direction,
  cursor,
  onPaginationChange,
}: UsersTableProps) {
  const apiBase = useAppStore((store) => store.apiBase);
  const getUsersRequest = usersStore((store) => store.getUsersRequest);
  const users = usersStore((store) => store.users);
  const nextCursor = usersStore((store) => store.nextCursor);
  const previousCursor = usersStore((store) => store.previousCursor);
  const currentPageUserIds = usersStore((store) => store.currentPageUserIds);
  const setGetUsersRequest = usersStore((store) => store.setGetUsersRequest);
  const setNextCursor = usersStore((store) => store.setNextCursor);
  const setUsers = usersStore((store) => store.setUsers);
  const setUsersPage = usersStore((store) => store.setUsersPage);
  const setPreviousCursor = usersStore((store) => store.setPreviousCursor);

  const usersPage = useMemo(
    () =>
      currentPageUserIds.flatMap((id) => {
        const user = users[id];
        if (!user) {
          return [];
        }

        return {
          id: user.id,
          properties: JSON.stringify(user.properties),
          segments: JSON.stringify(user.segments),
        };
      }),
    [currentPageUserIds, users]
  );

  React.useEffect(() => {
    const setLoadResponse = (response: GetUsersResponse) => {
      if (response.users.length === 0 && cursor) {
        if (direction === CursorDirectionEnum.Before) {
          setNextCursor(null);
          setPreviousCursor(null);
          onPaginationChange({});
        }
      } else {
        setUsers(response.users);
        setUsersPage(response.users.map((u) => u.id));
        setNextCursor(response.nextCursor ?? null);
        setPreviousCursor(response.previousCursor ?? null);
      }
    };

    const params: GetUsersRequest = {
      segmentId,
      cursor,
      direction,
      workspaceId,
    };

    const handler = apiRequestHandlerFactory({
      request: getUsersRequest,
      setRequest: setGetUsersRequest,
      responseSchema: GetUsersResponse,
      setResponse: setLoadResponse,
      requestConfig: {
        method: "GET",
        url: `${apiBase}/api/users`,
        params,
        headers: {
          "Content-Type": "application/json",
        },
      },
    });
    handler();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentId, cursor, direction]);

  const isLoading = getUsersRequest.type === CompletionStatus.InProgress;

  return (
    <DataGrid
      rows={usersPage}
      sx={{ height: "100%", width: "100%" }}
      getRowId={(row) => row.id}
      autoHeight
      columns={[
        {
          field: "id",
        },
        {
          field: "properties",
        },
        {
          field: "segments",
        },
      ].map((c) => ({ ...baseColumn, ...c }))}
      loading={isLoading}
      slots={{
        footer: CustomPagination,
      }}
      slotProps={{
        footer: {
          hasNextPage: !!nextCursor,
          hasPreviousPage: !!previousCursor,
          onNextPage: () =>
            onPaginationChange({
              cursor: nextCursor ?? undefined,
              direction: CursorDirectionEnum.After,
            }),

          onPreviousPage: () =>
            onPaginationChange({
              cursor: previousCursor ?? undefined,
              direction: CursorDirectionEnum.Before,
            }),
        },
      }}
    />
  );
}
