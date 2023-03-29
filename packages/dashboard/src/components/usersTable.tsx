import { DataGrid, GridColDef } from "@mui/x-data-grid";
import {
  EphemeralRequestStatus,
  GetEventsResponseItem,
} from "isomorphic-lib/src/types";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { shallow } from "zustand/shallow";

interface UsersState {
  currentPageUserIds: string[];
  previousCursor?: string;
  nextCursor?: string;
}

interface UsersActions {
  setCurrentPageUserIds: (val: string[]) => void;
  setPreviousCursor: (val: string) => void;
  setNextCursor: (val: string) => void;
}

export const usersStore = create(
  immer<UsersState & UsersActions>((set) => ({
    currentPageUserIds: [],
    setCurrentPageUserIds: (ids) =>
      set((state) => {
        state.currentPageUserIds = ids;
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

// FIXME use autoPageSize
export default function UsersTable({ segmentId }: { segmentId?: string }) {
  return <></>;
}
