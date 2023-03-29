import { KeyboardArrowLeft, KeyboardArrowRight } from "@mui/icons-material";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import {
  DataGrid,
  GridColDef,
  GridSlotsComponentsProps,
} from "@mui/x-data-grid";
import {
  CompletionStatus,
  CursorDirectionEnum,
  EphemeralRequestStatus,
  GetUsersRequest,
  GetUsersResponse,
  GetUsersResponseItem,
} from "isomorphic-lib/src/types";
import React, { useMemo } from "react";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import renderCell from "../lib/renderCell";

const baseColumn: Partial<GridColDef<GetUsersResponseItem>> = {
  flex: 1,
  sortable: false,
  filterable: false,
  renderCell,
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
  previousCursor?: string;
  nextCursor?: string;
}

interface UsersActions {
  setUsers: (val: GetUsersResponseItem[]) => void;
  setUsersPage: (val: string[]) => void;
  setGetUsersRequest: (val: EphemeralRequestStatus<Error>) => void;
  setPreviousCursor: (val: string) => void;
  setNextCursor: (val: string) => void;
}

export const usersStore = create(
  immer<UsersState & UsersActions>((set) => ({
    users: {},
    currentPageUserIds: [],
    getUsersRequest: {
      type: CompletionStatus.NotStarted,
    },
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

export type Props = Omit<GetUsersRequest, "limit"> & {
  onPaginationChange: (args: OnPaginationChangeProps) => void;
};
export default function UsersTable({
  segmentId,
  direction,
  cursor,
  onPaginationChange,
}: Props) {
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
      if (response.nextCursor) {
        setNextCursor(response.nextCursor);
      }
      if (response.previousCursor) {
        setPreviousCursor(response.previousCursor);
      }
      setUsers(response.users);
      setUsersPage(response.users.map((u) => u.id));
    };

    const params: GetUsersRequest = {
      segmentId,
      cursor,
      direction,
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
      getRowId={(row) => row.id}
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
              cursor: nextCursor,
              direction: CursorDirectionEnum.After,
            }),

          onPreviousPage: () =>
            onPaginationChange({
              cursor: nextCursor,
              direction: CursorDirectionEnum.Before,
            }),
        },
      }}
    />
  );
}
