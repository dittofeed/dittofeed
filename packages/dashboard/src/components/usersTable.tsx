import { DataGrid, GridPaginationModel, GridRowId } from "@mui/x-data-grid";
import {
  CompletionStatus,
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

export default function UsersTable({
  segmentId,
  direction,
  cursor,
}: Omit<GetUsersRequest, "limit">) {
  const mapPageToNextCursor = React.useRef<Record<number, GridRowId>>({});

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
  const [paginationModel, setPaginationModel] = React.useState({
    page: 0,
    pageSize: 10,
  });

  const handlePaginationModelChange = (
    newPaginationModel: GridPaginationModel
  ) => {
    // We have the cursor, we can allow the page transition.
    const handledCursor =
      mapPageToNextCursor.current[newPaginationModel.page - 1];

    if (newPaginationModel.page === 0 || handledCursor) {
      setPaginationModel(newPaginationModel);
    }
  };

  const usersPage = useMemo(
    () => currentPageUserIds.flatMap((id) => users[id] ?? []),
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

  React.useEffect(() => {
    if (cursor) {
      mapPageToNextCursor.current[paginationModel.page] = cursor;
    }
    if (!isLoading && nextCursor) {
      mapPageToNextCursor.current[paginationModel.page + 1] = nextCursor;
    }
    if (!isLoading && previousCursor) {
      mapPageToNextCursor.current[paginationModel.page - 1] = previousCursor;
    }
  }, [cursor, paginationModel.page, previousCursor, nextCursor, isLoading]);

  return (
    <>
      <DataGrid
        paginationMode="server"
        onPaginationModelChange={handlePaginationModelChange}
      />
    </>
  );
}
