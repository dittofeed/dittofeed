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
  ButtonProps,
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
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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

import { useAppStore, useAppStorePick } from "../lib/appStore";
import { greyTextFieldStyles } from "./greyScaleStyles";
import { SquarePaper } from "./squarePaper";
import {
  UserFilterState,
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

// Define the DeleteUsersRequest type if it doesn't exist elsewhere
interface DeleteUsersRequest {
  workspaceId: string;
  userIds: string[];
}

// Actions menu item
function ActionsCell({
  userId,
  onOptimisticDelete,
}: {
  userId: string;
  onOptimisticDelete?: (userId: string) => void;
}) {
  const theme = useTheme();
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);
  const queryClient = useQueryClient();
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleteSuccess, setDeleteSuccess] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");
  const open = Boolean(anchorEl);

  // Get workspaceId from the workspace object
  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : "";

  const deleteUserMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) {
        throw new Error("Workspace ID not available");
      }

      const response = await axios.delete(`${apiBase}/api/users`, {
        data: {
          workspaceId,
          userIds: [userId],
        } satisfies DeleteUsersRequest,
      });
      return response.data;
    },
    onMutate: () => {
      // Optimistically update the UI by removing the user from the table
      onOptimisticDelete?.(userId);
    },
    onSuccess: () => {
      setDeleteSuccess(true);

      // Invalidate and refetch the users and usersCount queries
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["usersCount"] });
    },
    onError: (error) => {
      console.error("Failed to delete user:", error);
      setDeleteError(true);

      // Extract error message from the error response if available
      if (axios.isAxiosError(error) && error.response?.data?.message) {
        setErrorMessage(error.response.data.message);
      } else {
        setErrorMessage("Failed to delete user. Please try again.");
      }

      // Since the optimistic update already happened, we need to refetch to restore data
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["usersCount"] });
    },
  });

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
    deleteUserMutation.mutate();
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

const actionsCellRenderer = ({
  row,
  table,
}: {
  row: { original: { id: string } };
  table: {
    options: { meta?: { performOptimisticDelete?: (userId: string) => void } };
  };
}) => {
  const onOptimisticDelete = table.options.meta?.performOptimisticDelete;
  return (
    <ActionsCell
      userId={row.original.id}
      onOptimisticDelete={onOptimisticDelete}
    />
  );
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
  segmentNameOverrides?: UserFilterState["segmentNameOverrides"];
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
  segmentNameOverrides,
}: UsersTableProps) {
  const apiBase = useAppStore((store) => store.apiBase);

  const [userFilterState, userFilterUpdater] = useUserFilterState({
    segments: segmentIds ? new Set(segmentIds) : undefined,
    staticSegments: segmentIds ? new Set(segmentIds) : undefined,
    segmentNameOverrides,
  });

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
      JSON.stringify(Array.from(userFilterState.userProperties.entries())) +
      JSON.stringify(Array.from(userFilterState.segments)),
    [userFilterState],
  );

  // Function to prepare common filter parameters for both queries
  const getCommonQueryParams = useCallback(() => {
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

    return {
      segmentFilter:
        allFilterSegments.size > 0 ? Array.from(allFilterSegments) : undefined,
      workspaceId,
      userPropertyFilter: requestUserPropertyFilter,
    };
  }, [userFilterState, segmentIds, workspaceId]);

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
      {
        id: "actions",
        header: "",
        size: 70,
        cell: actionsCellRenderer,
      },
    ],
    [userUriTemplate],
  );

  // Function to optimistically delete a user from the table
  const performOptimisticDelete = useCallback(
    (userId: string) => {
      setState((draft) => {
        // Remove user from currentPageUserIds array
        draft.currentPageUserIds = draft.currentPageUserIds.filter(
          (id) => id !== userId,
        );

        // Remove user from users object
        if (draft.users[userId]) {
          delete draft.users[userId];
        }

        // Decrement the count if it exists
        if (draft.usersCount !== null) {
          draft.usersCount -= 1;
        }
      });
    },
    [setState],
  );

  const table = useReactTable({
    columns,
    data: usersData,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      performOptimisticDelete,
    },
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
                          Total users: {countQuery.data ?? 0}
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
