import {
  Bolt as BoltIcon,
  ContentCopy as ContentCopyIcon,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  OpenInNew,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  ButtonProps,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Snackbar,
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
  useTheme,
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
import { NextRouter } from "next/router";
import React, { useCallback, useMemo } from "react";
import { useImmer } from "use-immer";

import { useAppStore } from "../lib/appStore";
import { filterStorePick } from "../lib/filterStore";
import { useUserFilterState } from "./usersTable/userFiltersState";
import { UsersFilterV2 } from "./usersTable/usersFilterV2";

// Cell components defined outside the main component
function UserIdCell({
  value,
  userUriTemplate,
}: {
  value: string;
  userUriTemplate: string;
}) {
  const [showCopied, setShowCopied] = React.useState(false);
  const uri = userUriTemplate.replace("{userId}", value);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setShowCopied(true);
  };

  return (
    <>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ maxWidth: "280px" }}
      >
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
        <Tooltip title="Copy ID">
          <IconButton size="small" onClick={handleCopy}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="View User Profile">
          <IconButton size="small" component={Link} href={uri}>
            <OpenInNew fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Snackbar
        open={showCopied}
        autoHideDuration={2000}
        onClose={() => setShowCopied(false)}
        message="User ID copied to clipboard"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}

function EmailCell({ email }: { email: string }) {
  const [showCopied, setShowCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(email);
    setShowCopied(true);
  };

  return (
    <>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ maxWidth: "280px" }}
      >
        <Tooltip title={email} placement="bottom-start">
          <Typography
            sx={{
              textDecoration: "none",
              color: "text.primary",
              maxWidth: "220px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
            }}
          >
            {email || ""}
          </Typography>
        </Tooltip>
        {email && (
          <Tooltip title="Copy Email">
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <Snackbar
        open={showCopied}
        autoHideDuration={2000}
        onClose={() => setShowCopied(false)}
        message="Email copied to clipboard"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}

function SegmentsCell({
  segments,
}: {
  segments: Array<{ id: string; name: string }>;
}) {
  const theme = useTheme();

  const visibleSegments = segments.slice(0, 2);
  const hasMoreSegments = segments.length > 2;

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      {visibleSegments.map((segment) => (
        <Chip
          key={segment.id}
          label={segment.name}
          size="small"
          onClick={() => {
            window.location.href = `/segments/${segment.id}`;
          }}
          sx={{
            cursor: "pointer",
            color: theme.palette.grey[700],
            bgcolor: theme.palette.grey[200],
            "&:hover": {
              bgcolor: theme.palette.grey[300],
            },
          }}
        />
      ))}
      {hasMoreSegments && (
        <Chip
          label="..."
          size="small"
          sx={{
            color: theme.palette.grey[700],
            bgcolor: theme.palette.grey[200],
          }}
        />
      )}
    </Stack>
  );
}

// Cell renderer functions for the table columns
const userIdCellRenderer = ({
  getValue,
  userUriTemplate,
}: {
  getValue: () => unknown;
  userUriTemplate: string;
}) => (
  <UserIdCell value={getValue() as string} userUriTemplate={userUriTemplate} />
);

const emailCellRenderer = ({
  row,
}: {
  row: { original: { id: string; email: string } };
}) => <EmailCell email={row.original.email} />;

const segmentsCellRenderer = ({
  row,
}: {
  row: { original: { segments: Array<{ id: string; name: string }> } };
}) => <SegmentsCell segments={row.original.segments} />;

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
  segments: Array<{
    id: string;
    name: string;
  }>;
}

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

interface TableState {
  autoReload: boolean;
  users: Record<string, GetUsersResponseItem>;
  usersCount: number | null;
  currentPageUserIds: string[];
  getUsersRequest: EphemeralRequestStatus<Error>;
  previousCursor: string | null;
  nextCursor: string | null;
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

export const getUsersCountRequest = function getUsersCountRequest({
  params,
  apiBase,
}: {
  params: Omit<GetUsersRequest, "cursor" | "direction" | "limit">;
  apiBase: string;
}) {
  return axios.post(`${apiBase}/api/users/count`, params);
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
  const apiBase = useAppStore((store) => store.apiBase);
  const { userProperties: filterUserProperties, segments: filterSegments } =
    filterStorePick(["userProperties", "segments"]);

  const [userFilterState, userFilterUpdater] = useUserFilterState();

  const [state, setState] = useImmer<TableState>({
    autoReload: autoReloadByDefault,
    query: {
      cursor: cursor ?? null,
      limit: 10,
    },
    users: {},
    usersCount: null,
    currentPageUserIds: [],
    getUsersRequest: {
      type: CompletionStatus.NotStarted,
    },
    nextCursor: null,
    previousCursor: null,
  });

  const filtersHash = useMemo(
    () =>
      JSON.stringify(Array.from(filterUserProperties.entries())) +
      JSON.stringify(Array.from(filterSegments)),
    [filterUserProperties, filterSegments],
  );

  // Function to prepare common filter parameters for both queries
  const getCommonQueryParams = useCallback(() => {
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

    return {
      segmentFilter:
        allFilterSegments.size > 0 ? Array.from(allFilterSegments) : undefined,
      workspaceId,
      userPropertyFilter: requestUserPropertyFilter,
    };
  }, [filterUserProperties, filterSegments, segmentIds, workspaceId]);

  // Query for fetching users count
  const countQuery = useQuery({
    queryKey: ["usersCount", workspaceId, segmentIds, filtersHash],
    queryFn: async () => {
      const commonParams = getCommonQueryParams();

      try {
        const response = await getUsersCountRequest({
          params: commonParams,
          apiBase,
        });

        return response.data.userCount;
      } catch (error) {
        console.error("Failed to fetch users count", error);
        throw error;
      }
    },
    refetchInterval: state.autoReload ? reloadPeriodMs : false,
  });

  // Main query for fetching users
  const query = useQuery<GetUsersResponse>({
    queryKey: ["users", state.query, segmentIds, filtersHash],
    queryFn: async () => {
      const commonParams = getCommonQueryParams();

      const params: GetUsersRequest = {
        ...commonParams,
        cursor: state.query.cursor ?? undefined,
        direction,
        limit: state.query.limit,
      };

      setState((draft) => {
        draft.getUsersRequest = {
          type: CompletionStatus.InProgress,
        };
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
        setState((draft) => {
          draft.getUsersRequest = {
            type: CompletionStatus.InProgress,
          };
        });

        if (result.users.length === 0 && cursor) {
          if (direction === CursorDirectionEnum.Before) {
            setState((draft) => {
              draft.nextCursor = null;
              draft.previousCursor = null;
            });
            onPaginationChange({});
          }
        } else {
          setState((draft) => {
            for (const user of result.users) {
              draft.users[user.id] = user;
            }
            draft.currentPageUserIds = result.users.map((u) => u.id);
            draft.nextCursor = result.nextCursor ?? null;
            draft.previousCursor = result.previousCursor ?? null;
          });
        }

        return result;
      } catch (error) {
        setState((draft) => {
          draft.getUsersRequest = {
            type: CompletionStatus.Failed,
            error: error as Error,
          };
        });
        throw error;
      }
    },
    placeholderData: keepPreviousData,
    refetchInterval: state.autoReload ? reloadPeriodMs : false,
  });

  const usersData = useMemo<Row[]>(() => {
    return state.currentPageUserIds.flatMap((id) => {
      const user = state.users[id];
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

      return {
        id: user.id,
        email,
        segments: user.segments,
      };
    });
  }, [state.currentPageUserIds, state.users]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "id",
        header: "User ID",
        accessorKey: "id",
        cell: (info) => userIdCellRenderer({ ...info, userUriTemplate }),
      },
      {
        id: "email",
        header: "Email",
        accessorKey: "email",
        cell: (info) => emailCellRenderer(info),
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
    if (state.nextCursor) {
      onPaginationChange({
        cursor: state.nextCursor,
        direction: CursorDirectionEnum.After,
      });
      setState((draft) => {
        draft.query.cursor = state.nextCursor;
      });
    }
  }, [state.nextCursor, onPaginationChange, setState]);

  const onPreviousPage = useCallback(() => {
    if (state.previousCursor) {
      onPaginationChange({
        cursor: state.previousCursor,
        direction: CursorDirectionEnum.Before,
      });
      setState((draft) => {
        draft.query.cursor = state.previousCursor;
      });
    }
  }, [state.previousCursor, onPaginationChange, setState]);

  const onFirstPage = useCallback(() => {
    onPaginationChange({});
    setState((draft) => {
      draft.query.cursor = null;
    });
  }, [onPaginationChange, setState]);

  const handleRefresh = useCallback(() => {
    query.refetch();
    countQuery.refetch();
  }, [query, countQuery]);

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
        <UsersFilterV2 state={userFilterState} updater={userFilterUpdater} />
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
                sx={{
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
                      disabled={!state.previousCursor}
                      startIcon={<KeyboardDoubleArrowLeft />}
                    >
                      First
                    </GreyButton>
                    <GreyButton
                      onClick={onPreviousPage}
                      disabled={!state.previousCursor}
                      startIcon={<KeyboardArrowLeft />}
                    >
                      Previous
                    </GreyButton>
                    <GreyButton
                      onClick={onNextPage}
                      disabled={!state.nextCursor}
                      endIcon={<KeyboardArrowRight />}
                    >
                      Next
                    </GreyButton>
                  </Stack>
                  <Stack direction="row" spacing={2} alignItems="center">
                    {countQuery.data !== undefined && (
                      <Typography variant="body2" color="text.secondary">
                        Total users: {countQuery.data}
                      </Typography>
                    )}
                    {(isLoading ||
                      countQuery.isPending ||
                      countQuery.isFetching) && (
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
