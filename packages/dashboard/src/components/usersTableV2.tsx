import {
  Bolt as BoltIcon,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  ButtonProps,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { Type } from "@sinclair/typebox";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import axios from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  CursorDirectionEnum,
  EphemeralRequestStatus,
  GetUsersRequest,
  GetUsersResponse,
  GetUsersResponseItem,
  GetUsersUserPropertyFilter,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import { NextRouter, useRouter } from "next/router";
import React, { useCallback, useMemo } from "react";
import { useImmer } from "use-immer";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { useAppStore } from "../lib/appStore";
import { filterStorePick } from "../lib/filterStore";

// Cell components defined outside the main component
function UserIdCell({ value }: { value: string }) {
  return (
    <Tooltip title={value}>
      <Typography
        sx={{
          fontFamily: "monospace",
          maxWidth: "150px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </Typography>
    </Tooltip>
  );
}

function EmailCell({
  email,
  userId,
  userUriTemplate,
}: {
  email: string;
  userId: string;
  userUriTemplate: string;
}) {
  const uri = userUriTemplate.replace("{userId}", userId);

  return (
    <Tooltip title={email} placement="bottom-start">
      <Typography
        component={Link}
        href={uri}
        sx={{
          textDecoration: "none",
          color: "primary.main",
          "&:hover": {
            textDecoration: "underline",
          },
          maxWidth: "250px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "block",
        }}
      >
        {email || "N/A"}
      </Typography>
    </Tooltip>
  );
}

function SegmentsCell({ segments }: { segments: string }) {
  return (
    <Tooltip title={segments} placement="bottom-start">
      <Typography
        sx={{
          fontFamily: "monospace",
          maxWidth: "300px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {segments || "No segments"}
      </Typography>
    </Tooltip>
  );
}

// Cell renderer functions for the table columns
const userIdCellRenderer = ({ getValue }: { getValue: () => unknown }) => (
  <UserIdCell value={getValue() as string} />
);

const emailCellRenderer = ({
  row,
  userUriTemplate,
}: {
  row: { original: { id: string; email: string } };
  userUriTemplate: string;
}) => (
  <EmailCell
    email={row.original.email}
    userId={row.original.id}
    userUriTemplate={userUriTemplate}
  />
);

const segmentsCellRenderer = ({ getValue }: { getValue: () => unknown }) => (
  <SegmentsCell segments={getValue() as string} />
);

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
  email: string;
  segments: string;
}

interface UsersState {
  users: Record<string, GetUsersResponseItem>;
  usersCount: number | null;
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
  setUsersCount: (val: number) => void;
}

export const usersStore = create(
  immer<UsersState & UsersActions>((set) => ({
    users: {},
    usersCount: null,
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
    setUsersCount: (count) =>
      set((state) => {
        state.usersCount = count;
      }),
  })),
);

export const greyButtonStyle = {
  bgcolor: "grey.200",
  color: "grey.700",
  "&:hover": {
    bgcolor: "grey.300",
  },
  "&:active": {
    bgcolor: "grey.400",
  },
  "&.Mui-disabled": {
    bgcolor: "grey.100",
    color: "grey.400",
  },
} as const;

function GreyButton(props: ButtonProps) {
  const { sx, ...rest } = props;
  return (
    <Button
      {...rest}
      sx={{
        ...greyButtonStyle,
        ...sx,
      }}
    />
  );
}

export type OnPaginationChangeProps = Pick<
  GetUsersRequest,
  "direction" | "cursor"
>;

export type UsersTableProps = Omit<GetUsersRequest, "limit"> & {
  onPaginationChange: (args: OnPaginationChangeProps) => void;
  autoReloadByDefault?: boolean;
  reloadPeriodMs?: number;
  userUriTemplate?: string;
};

interface UserState {
  autoReload: boolean;
  query: {
    cursor: string | null;
    limit: number;
  };
}

export const defaultGetUsersRequest = function getUsersRequest({
  params,
  apiBase,
}: {
  params: GetUsersRequest;
  apiBase: string;
}) {
  return axios.post(`${apiBase}/api/users`, params);
};

export default function UsersTableV2({
  workspaceId,
  segmentFilter: segmentIds,
  direction,
  cursor,
  onPaginationChange,
  autoReloadByDefault = false,
  reloadPeriodMs = 30000,
  userUriTemplate = "/users/{userId}",
}: UsersTableProps) {
  const router = useRouter();
  const apiBase = useAppStore((store) => store.apiBase);
  const { userProperties: filterUserProperties, segments: filterSegments } =
    filterStorePick(["userProperties", "segments"]);

  const [state, setState] = useImmer<UserState>({
    autoReload: autoReloadByDefault,
    query: {
      cursor: cursor || null,
      limit: 10,
    },
  });

  const users = usersStore((store) => store.users);
  const nextCursor = usersStore((store) => store.nextCursor);
  const previousCursor = usersStore((store) => store.previousCursor);
  const currentPageUserIds = usersStore((store) => store.currentPageUserIds);
  const usersCount = usersStore((store) => store.usersCount);
  const setGetUsersRequest = usersStore((store) => store.setGetUsersRequest);
  const setNextCursor = usersStore((store) => store.setNextCursor);
  const setUsers = usersStore((store) => store.setUsers);
  const setUsersPage = usersStore((store) => store.setUsersPage);
  const setPreviousCursor = usersStore((store) => store.setPreviousCursor);
  const setUsersCount = usersStore((store) => store.setUsersCount);

  const filtersHash = useMemo(
    () =>
      JSON.stringify(Array.from(filterUserProperties.entries())) +
      JSON.stringify(Array.from(filterSegments)),
    [filterUserProperties, filterSegments],
  );

  const query = useQuery<GetUsersResponse>({
    queryKey: ["users", state, segmentIds, filtersHash],
    queryFn: async () => {
      const requestUserPropertyFilter: GetUsersUserPropertyFilter | undefined =
        filterUserProperties.size > 0
          ? Array.from(filterUserProperties).map((up) => ({
              id: up[0],
              values: Array.from(up[1]),
            }))
          : undefined;

      const allFilterSegments = new Set<string>(filterSegments);
      if (segmentIds) {
        for (const segmentId of segmentIds) {
          allFilterSegments.add(segmentId);
        }
      }

      const params: GetUsersRequest = {
        segmentFilter:
          allFilterSegments.size > 0
            ? Array.from(allFilterSegments)
            : undefined,
        cursor: state.query.cursor ?? undefined,
        direction,
        workspaceId,
        userPropertyFilter: requestUserPropertyFilter,
        limit: state.query.limit,
      };

      setGetUsersRequest({
        type: CompletionStatus.InProgress,
      });

      try {
        const response = await defaultGetUsersRequest({
          params,
          apiBase,
        });

        const result = unwrap(
          schemaValidateWithErr(response.data, GetUsersResponse),
        );

        // Use InProgress status as the final state instead of trying to use Successful
        setGetUsersRequest({
          type: CompletionStatus.InProgress,
        });

        setUsersCount(result.userCount);
        if (result.users.length === 0 && cursor) {
          if (direction === CursorDirectionEnum.Before) {
            setNextCursor(null);
            setPreviousCursor(null);
            onPaginationChange({});
          }
        } else {
          setUsers(result.users);
          setUsersPage(result.users.map((u) => u.id));
          setNextCursor(result.nextCursor ?? null);
          setPreviousCursor(result.previousCursor ?? null);
        }

        return result;
      } catch (error) {
        setGetUsersRequest({
          type: CompletionStatus.Failed,
          error: error as Error,
        });
        throw error;
      }
    },
    placeholderData: keepPreviousData,
    refetchInterval: state.autoReload ? reloadPeriodMs : false,
  });

  const usersData = useMemo<Row[]>(() => {
    return currentPageUserIds.flatMap((id) => {
      const user = users[id];
      if (!user) {
        return [];
      }

      // Find the email property if it exists
      let email = "";
      for (const propId in user.properties) {
        const prop = user.properties[propId];
        if (prop && prop.name.toLowerCase() === "email") {
          email = prop.value;
          break;
        }
      }

      const segments = user.segments.map((segment) => segment.name).join(", ");

      return {
        id: user.id,
        email,
        segments,
      };
    });
  }, [currentPageUserIds, users]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "id",
        header: "User ID",
        accessorKey: "id",
        cell: userIdCellRenderer,
      },
      {
        id: "email",
        header: "Email",
        accessorKey: "email",
        cell: (info) => emailCellRenderer({ ...info, userUriTemplate }),
      },
      {
        id: "segments",
        header: "Segments",
        accessorKey: "segments",
        cell: segmentsCellRenderer,
      },
    ],
    [userUriTemplate],
  );

  const table = useReactTable({
    columns,
    data: usersData,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const onNextPage = useCallback(() => {
    if (nextCursor) {
      onPaginationChange({
        cursor: nextCursor,
        direction: CursorDirectionEnum.After,
      });
      setState((draft) => {
        draft.query.cursor = nextCursor;
      });
    }
  }, [nextCursor, onPaginationChange, setState]);

  const onPreviousPage = useCallback(() => {
    if (previousCursor) {
      onPaginationChange({
        cursor: previousCursor,
        direction: CursorDirectionEnum.Before,
      });
      setState((draft) => {
        draft.query.cursor = previousCursor;
      });
    }
  }, [previousCursor, onPaginationChange, setState]);

  const onFirstPage = useCallback(() => {
    onPaginationChange({});
    setState((draft) => {
      draft.query.cursor = null;
    });
  }, [onPaginationChange, setState]);

  const handleRefresh = useCallback(() => {
    query.refetch();
  }, [query]);

  const toggleAutoRefresh = useCallback(() => {
    setState((draft) => {
      draft.autoReload = !draft.autoReload;
    });
  }, [setState]);

  const isLoading = query.isPending || query.isFetching;

  return (
    <Stack
      spacing={1}
      sx={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        alignItems: "stretch",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ width: "100%", height: "48px" }}
      >
        <Box flex={1} />
        <Tooltip title="Refresh Results" placement="bottom-start">
          <IconButton
            onClick={handleRefresh}
            sx={{
              border: "1px solid",
              borderColor: "grey.400",
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
        <Tooltip
          title={`Auto refresh every ${Math.floor(reloadPeriodMs / 1000)} seconds`}
          placement="bottom-start"
        >
          <IconButton
            onClick={toggleAutoRefresh}
            sx={{
              border: "1px solid",
              borderColor: "grey.400",
              bgcolor: state.autoReload ? "grey.600" : "inherit",
              color: state.autoReload ? "white" : "inherit",
              "&:hover": {
                bgcolor: state.autoReload ? "grey.700" : undefined,
              },
            }}
          >
            <BoltIcon />
          </IconButton>
        </Tooltip>
      </Stack>
      <TableContainer component={Paper}>
        <Table stickyHeader>
          <TableHead>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableCell key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : (
                      <Box>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </Box>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableHead>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                hover
                onClick={() => {
                  router.push({
                    pathname: `/users/${row.original.id}`,
                  });
                }}
                sx={{
                  cursor: "pointer",
                  "&:hover": {
                    backgroundColor: "rgba(0, 0, 0, 0.04)",
                  },
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter
            sx={{
              position: "sticky",
              bottom: 0,
            }}
          >
            <TableRow>
              <TableCell
                colSpan={table.getAllColumns().length}
                sx={{
                  bgcolor: "background.paper",
                  borderTop: "1px solid",
                  borderColor: "grey.100",
                }}
              >
                <Stack
                  direction="row"
                  spacing={2}
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <GreyButton
                      onClick={onFirstPage}
                      disabled={!previousCursor}
                      startIcon={<KeyboardDoubleArrowLeft />}
                    >
                      First
                    </GreyButton>
                    <GreyButton
                      onClick={onPreviousPage}
                      disabled={!previousCursor}
                      startIcon={<KeyboardArrowLeft />}
                    >
                      Previous
                    </GreyButton>
                    <GreyButton
                      onClick={onNextPage}
                      disabled={!nextCursor}
                      endIcon={<KeyboardArrowRight />}
                    >
                      Next
                    </GreyButton>
                  </Stack>
                  <Stack direction="row" spacing={2} alignItems="center">
                    {usersCount !== null && (
                      <Typography variant="body2" color="text.secondary">
                        Total users: {usersCount}
                      </Typography>
                    )}
                    {isLoading && (
                      <CircularProgress color="inherit" size={20} />
                    )}
                  </Stack>
                </Stack>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>
    </Stack>
  );
}
