import {
  Bolt as BoltIcon,
  ContentCopy as ContentCopyIcon,
  Delete as DeleteIcon,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  MoreVert as MoreVertIcon,
  OpenInNew,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Popover,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { Type } from "@sinclair/typebox";
import { keepPreviousData } from "@tanstack/react-query";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import axios from "axios";
import deepEqual from "fast-deep-equal";
import {
  CursorDirectionEnum,
  GetUsersRequest,
  GetUsersResponseItem,
  GetUsersUserPropertyFilter,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import { NextRouter, useRouter } from "next/router";
import React, { useCallback, useEffect, useMemo } from "react";
import { useImmer } from "use-immer";

import { useAppStore } from "../lib/appStore";
import { useDeleteUserMutation } from "../lib/useDeleteUserMutation";
import { useUsersCountQuery } from "../lib/useUsersCountQuery";
import { useUsersQuery } from "../lib/useUsersQuery";
import { GreyButton } from "./greyButtonStyle";
import { greyTextFieldStyles } from "./greyScaleStyles";
import { SquarePaper } from "./squarePaper";
import {
  useUserFiltersHash,
  useUserFilterState,
} from "./usersTable/userFiltersState";
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

function SegmentsPopover({
  segments,
  onSegmentSelect,
}: {
  segments: { id: string; name: string }[];
  onSegmentSelect: (id: string) => void;
}) {
  const theme = useTheme();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const options = segments.map((segment) => ({
    id: segment.id,
    label: segment.name,
  }));

  // Focus the input when the component is rendered
  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  return (
    <Autocomplete
      onChange={(_, value) => {
        if (value) {
          onSegmentSelect(value.id);
        }
      }}
      options={options}
      open
      ListboxProps={{
        sx: {
          padding: 0,
        },
      }}
      PaperComponent={SquarePaper}
      sx={{
        width: theme.spacing(30),
        height: "100%",
      }}
      autoComplete
      disablePortal
      renderInput={(params) => (
        <TextField
          {...params}
          variant="filled"
          label="Segment"
          autoFocus
          inputRef={inputRef}
          InputProps={{
            ...params.InputProps,
            sx: {
              borderRadius: 0,
            },
          }}
          sx={greyTextFieldStyles}
        />
      )}
      renderOption={(props, option) => (
        <MenuItem
          {...props}
          sx={{
            borderRadius: 0,
            color: theme.palette.grey[700],
          }}
        >
          <Tooltip title={option.label}>
            <Box
              sx={{
                width: "100%",
                textOverflow: "ellipsis",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {option.label}
            </Box>
          </Tooltip>
        </MenuItem>
      )}
    />
  );
}

function SegmentsCell({
  segments,
}: {
  segments: { id: string; name: string }[];
}) {
  const theme = useTheme();
  const router = useRouter();
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const visibleSegments = segments.slice(0, 2);
  const hasMoreSegments = segments.length > 2;

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSegmentSelect = (segmentId: string) => {
    router.push(`/segments/${segmentId}`);
    handleClose();
  };

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      {visibleSegments.map((segment) => (
        <Chip
          key={segment.id}
          label={segment.name}
          size="small"
          onClick={() => {
            router.push(`/segments/${segment.id}`);
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
        <>
          <Chip
            label="..."
            size="small"
            onClick={handleClick}
            sx={{
              cursor: "pointer",
              color: theme.palette.grey[700],
              bgcolor: theme.palette.grey[200],
              "&:hover": {
                bgcolor: theme.palette.grey[300],
              },
            }}
          />
          <Popover
            open={open}
            anchorEl={anchorEl}
            onClose={handleClose}
            onClick={(e) => e.stopPropagation()}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "left",
            }}
            transformOrigin={{
              vertical: "top",
              horizontal: "left",
            }}
            sx={{
              "& .MuiPopover-paper": {
                overflow: "visible",
                borderRadius: 0,
                boxShadow: 4,
              },
              p: 0,
            }}
          >
            <SegmentsPopover
              segments={segments}
              onSegmentSelect={handleSegmentSelect}
            />
          </Popover>
        </>
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
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
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
  row: { original: { segments: { id: string; name: string }[] } };
}) => <SegmentsCell segments={row.original.segments} />;

// Actions menu item
function ActionsCell({ userId }: { userId: string }) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleteSuccess, setDeleteSuccess] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");
  const open = Boolean(anchorEl);

  const deleteUserMutation = useDeleteUserMutation();

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleDeleteClick = () => {
    handleClose();
    setConfirmOpen(true);
  };

  const handleConfirmClose = () => {
    setConfirmOpen(false);
  };

  const handleConfirmDelete = () => {
    deleteUserMutation.mutate([userId], {
      onSuccess: () => {
        setDeleteSuccess(true);
      },
      onError: (error) => {
        setDeleteError(true);
        if (axios.isAxiosError(error) && error.response?.data) {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          const errorData = error.response.data as { message?: string };
          setErrorMessage(
            errorData.message ?? "Failed to delete user. Please try again.",
          );
        } else {
          setErrorMessage("Failed to delete user. Please try again.");
        }
      },
    });
    handleConfirmClose();
  };

  return (
    <>
      <IconButton
        onClick={handleClick}
        size="small"
        sx={{
          color: theme.palette.grey[700],
          "&:hover": {
            bgcolor: theme.palette.grey[200],
          },
        }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        PaperProps={{
          sx: {
            borderRadius: 0,
            boxShadow: 4,
            minWidth: theme.spacing(15),
          },
        }}
      >
        <MenuItem
          onClick={handleDeleteClick}
          sx={{
            borderRadius: 0,
            py: 1.5,
            color: theme.palette.grey[700],
            "&:hover": {
              bgcolor: theme.palette.grey[100],
            },
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <DeleteIcon
              fontSize="small"
              sx={{ color: theme.palette.grey[700] }}
            />
            <Typography variant="body2">Delete</Typography>
          </Stack>
        </MenuItem>
      </Menu>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onClose={handleConfirmClose}>
        <DialogTitle>Confirm deletion</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this user? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={(e) => {
              e.preventDefault();
              handleConfirmClose();
            }}
            sx={{ color: theme.palette.grey[700] }}
          >
            Cancel
          </Button>
          <Button
            onClick={(e) => {
              e.preventDefault();
              handleConfirmDelete();
            }}
            color="primary"
            autoFocus
            disabled={deleteUserMutation.isPending}
            sx={{
              bgcolor: theme.palette.error.main,
              color: "white",
              "&:hover": {
                bgcolor: theme.palette.error.dark,
              },
            }}
          >
            {deleteUserMutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={deleteSuccess}
        autoHideDuration={2000}
        onClose={() => setDeleteSuccess(false)}
        message="User successfully deleted"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />

      {/* Error Snackbar */}
      <Snackbar
        open={deleteError}
        autoHideDuration={4000}
        onClose={() => setDeleteError(false)}
        message={errorMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        ContentProps={{
          sx: {
            bgcolor: theme.palette.error.main,
          },
        }}
      />
    </>
  );
}

const actionsCellRendererFactory = () => {
  return function ActionsCellRenderer({
    row,
  }: {
    row: { original: { id: string } };
  }) {
    return <ActionsCell userId={row.original.id} />;
  };
};

export const UsersTableParams = Type.Pick(GetUsersRequest, [
  "cursor",
  "direction",
]);

export function usersTablePaginationHandler(router: NextRouter) {
  const onUsersTablePaginate = ({
    direction,
    cursor,
  }: OnPaginationChangeProps) => {
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      direction: existingDirection,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      cursor: existingCursor,
      ...remainingParams
    } = router.query;
    // existingDirection and existingCursor are intentionally not used here.
    // We only care about the remainingParams to construct the new query.

    const newQuery: Record<string, string | string[] | undefined> = {
      ...remainingParams,
    };
    if (direction) {
      newQuery.direction = direction;
    }
    if (cursor) {
      newQuery.cursor = cursor;
    }
    const routerParams = {
      pathname: router.pathname,
      query: newQuery,
    };
    router.push(routerParams, undefined, { shallow: true });
  };
  return onUsersTablePaginate;
}

interface Row {
  id: string;
  email: string;
  segments: {
    id: string;
    name: string;
  }[];
}

export type OnPaginationChangeProps = Pick<
  GetUsersRequest,
  "direction" | "cursor"
>;

export type UsersTableProps = Omit<GetUsersRequest, "workspaceId"> & {
  onPaginationChange?: (args: OnPaginationChangeProps) => void;
  autoReloadByDefault?: boolean;
  reloadPeriodMs?: number;
  userUriTemplate?: string;
  hideControls?: boolean;
};

interface TableState {
  autoReload: boolean;
  users: Record<string, GetUsersResponseItem>;
  usersCount: number | null;
  currentPageUserIds: string[];
  currentCursor: string | null;
  previousCursor: string | null;
  nextCursor: string | null;
  query: {
    cursor: string | null;
    limit: number;
    direction: CursorDirectionEnum | null;
  };
}

export default function UsersTableV2({
  segmentFilter: segmentIds,
  subscriptionGroupFilter: subscriptionGroupIds,
  direction,
  cursor,
  onPaginationChange,
  autoReloadByDefault = false,
  reloadPeriodMs = 10000,
  userUriTemplate = "/users/{userId}",
  limit,
  hideControls = false,
}: UsersTableProps) {
  useAppStore();
  const [userFilterState, userFilterUpdater] = useUserFilterState({
    segments: segmentIds ? new Set(segmentIds) : undefined,
    staticSegments: segmentIds ? new Set(segmentIds) : undefined,
    subscriptionGroups: subscriptionGroupIds
      ? new Set(subscriptionGroupIds)
      : undefined,
    staticSubscriptionGroups: subscriptionGroupIds
      ? new Set(subscriptionGroupIds)
      : undefined,
  });

  useEffect(() => {
    userFilterUpdater((draft) => {
      const oldStaticSegments = draft.staticSegments;
      const newStaticSegments = new Set(segmentIds);
      if (
        deepEqual(Array.from(oldStaticSegments), Array.from(newStaticSegments))
      ) {
        return draft;
      }

      for (const segmentId of oldStaticSegments) {
        draft.segments.delete(segmentId);
        draft.staticSegments.delete(segmentId);
      }

      for (const segmentId of newStaticSegments) {
        draft.segments.add(segmentId);
        draft.staticSegments.add(segmentId);
      }
      return draft;
    });
  }, [segmentIds, userFilterUpdater]);

  useEffect(() => {
    userFilterUpdater((draft) => {
      const oldStaticSubscriptionGroups = draft.staticSubscriptionGroups;
      for (const subscriptionGroupId of oldStaticSubscriptionGroups) {
        draft.subscriptionGroups.delete(subscriptionGroupId);
        draft.staticSubscriptionGroups.delete(subscriptionGroupId);
      }

      const newStaticSubscriptionGroups = new Set(subscriptionGroupIds);
      for (const subscriptionGroupId of newStaticSubscriptionGroups) {
        draft.subscriptionGroups.add(subscriptionGroupId);
        draft.staticSubscriptionGroups.add(subscriptionGroupId);
      }
    });
  }, [subscriptionGroupIds, userFilterUpdater]);

  const [state, setState] = useImmer<TableState>({
    autoReload: autoReloadByDefault,
    query: {
      cursor: cursor ?? null,
      direction: direction ?? null,
      limit: limit ?? 10,
    },
    users: {},
    currentPageUserIds: [],
    currentCursor: cursor ?? null,
    nextCursor: null,
    previousCursor: null,
    usersCount: null,
  });

  useUserFiltersHash(userFilterState);

  const getCommonQueryParams = useCallback((): Omit<
    GetUsersRequest,
    "workspaceId" | "limit" | "cursor" | "direction"
  > => {
    const requestUserPropertyFilter: GetUsersUserPropertyFilter | undefined =
      userFilterState.userProperties.size > 0
        ? Array.from(userFilterState.userProperties).map((up) => ({
            id: up[0],
            values: Array.from(up[1]),
          }))
        : undefined;

    const allFilterSegments = new Set<string>(userFilterState.segments);
    if (segmentIds) {
      for (const segmentId of segmentIds) {
        allFilterSegments.add(segmentId);
      }
    }

    const allFilterSubscriptionGroups = new Set<string>(
      userFilterState.subscriptionGroups,
    );
    if (subscriptionGroupIds) {
      for (const subscriptionGroupId of subscriptionGroupIds) {
        allFilterSubscriptionGroups.add(subscriptionGroupId);
      }
    }

    return {
      segmentFilter:
        allFilterSegments.size > 0 ? Array.from(allFilterSegments) : undefined,
      subscriptionGroupFilter:
        allFilterSubscriptionGroups.size > 0
          ? Array.from(allFilterSubscriptionGroups)
          : undefined,
      userPropertyFilter: requestUserPropertyFilter,
    };
  }, [userFilterState, segmentIds, subscriptionGroupIds]);

  const commonQueryListParams = useMemo(
    () => getCommonQueryParams(),
    [getCommonQueryParams],
  );

  const countQuery = useUsersCountQuery(commonQueryListParams, {
    refetchInterval: state.autoReload ? reloadPeriodMs : false,
    placeholderData: keepPreviousData,
  });

  const usersListQuery = useUsersQuery(
    {
      ...commonQueryListParams,
      cursor: state.query.cursor ?? undefined,
      direction: state.query.direction ?? undefined,
      limit: state.query.limit,
    },
    {
      refetchInterval: state.autoReload ? reloadPeriodMs : false,
      placeholderData: keepPreviousData,
    },
  );

  useEffect(() => {
    if (usersListQuery.data) {
      const result = usersListQuery.data;
      if (
        result.users.length < state.query.limit &&
        state.query.direction === CursorDirectionEnum.Before
      ) {
        setState((draft) => {
          draft.nextCursor = null;
          draft.previousCursor = null;
          draft.query.cursor = null;
          draft.query.direction = null;
          draft.currentCursor = null;
        });
        onPaginationChange?.({});
      } else if (
        result.users.length === 0 &&
        state.query.direction === CursorDirectionEnum.After
      ) {
        // Rollback to the last cursor if the next page is empty.
        setState((draft) => {
          draft.query.cursor = state.currentCursor;
        });
        onPaginationChange?.({
          cursor: state.currentCursor ?? undefined,
        });
      } else {
        setState((draft) => {
          const newUsersMap: Record<string, GetUsersResponseItem> = {};
          result.users.forEach((user: GetUsersResponseItem) => {
            newUsersMap[user.id] = user;
          });
          draft.users = newUsersMap;
          draft.currentPageUserIds = result.users.map(
            (u: GetUsersResponseItem) => u.id,
          );
          draft.nextCursor = result.nextCursor ?? null;
          draft.previousCursor = result.previousCursor ?? null;
          draft.currentCursor = state.query.cursor ?? null;
        });
      }
    }
  }, [
    usersListQuery.data,
    setState,
    onPaginationChange,
    cursor,
    state.query.direction,
    state.query.cursor,
    state.currentCursor,
  ]);

  useEffect(() => {
    if (countQuery.data !== undefined) {
      setState((draft) => {
        draft.usersCount = countQuery.data;
      });
    }
  }, [countQuery.data, setState]);

  const usersData = useMemo<Row[]>(() => {
    return state.currentPageUserIds.flatMap((id) => {
      const user = state.users[id];
      if (!user) {
        return [];
      }

      let email = "";
      for (const propId in user.properties) {
        const prop = user.properties[propId];
        if (prop && prop.name.toLowerCase() === "email") {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          email = prop.value as string;
          break;
        }
      }

      return [
        {
          id: user.id,
          email,
          segments: user.segments,
        },
      ];
    });
  }, [state.currentPageUserIds, state.users]);

  const actionsCellRenderer = useMemo(() => {
    return actionsCellRendererFactory();
  }, []);

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
      {
        id: "actions",
        header: "",
        size: 70,
        cell: actionsCellRenderer,
      },
    ],
    [userUriTemplate, actionsCellRenderer],
  );

  const table = useReactTable({
    columns,
    data: usersData,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const onNextPage = useCallback(() => {
    if (state.nextCursor) {
      onPaginationChange?.({
        cursor: state.nextCursor,
        direction: CursorDirectionEnum.After,
      });
      setState((draft) => {
        draft.query.cursor = state.nextCursor;
        draft.query.direction = CursorDirectionEnum.After;
      });
    }
  }, [state.nextCursor, onPaginationChange, setState]);

  const onPreviousPage = useCallback(() => {
    if (state.previousCursor) {
      setState((draft) => {
        if (draft.query.direction === CursorDirectionEnum.Before) {
          draft.query.cursor = state.previousCursor;
        } else if (draft.query.direction === CursorDirectionEnum.After) {
          draft.query.direction = CursorDirectionEnum.Before;
        }
        onPaginationChange?.({
          cursor: draft.query.cursor ?? undefined,
          direction: draft.query.direction ?? undefined,
        });
      });
    }
  }, [state.previousCursor, onPaginationChange, setState]);

  const onFirstPage = useCallback(() => {
    onPaginationChange?.({});
    setState((draft) => {
      draft.query.cursor = null;
      draft.query.direction = null;
    });
  }, [onPaginationChange, setState]);

  const handleRefresh = useCallback(() => {
    usersListQuery.refetch();
    countQuery.refetch();
  }, [usersListQuery, countQuery]);

  const toggleAutoRefresh = useCallback(() => {
    setState((draft) => {
      draft.autoReload = !draft.autoReload;
    });
  }, [setState]);

  const isLoading = usersListQuery.isPending || usersListQuery.isFetching;
  let controls: React.ReactNode = null;
  if (!hideControls) {
    controls = (
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
    );
  }

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
      {controls}
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
                    {isLoading ||
                    countQuery.isPending ||
                    countQuery.isFetching ? (
                      <CircularProgress color="inherit" size={20} />
                    ) : (
                      <Stack
                        direction="row"
                        justifyContent="flex-start"
                        alignItems="center"
                        spacing={2}
                        sx={{
                          minWidth: "100px",
                        }}
                      >
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            height: "100%",
                          }}
                        >
                          Total users:{" "}
                          {countQuery.data ?? state.usersCount ?? 0}
                        </Typography>
                      </Stack>
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
