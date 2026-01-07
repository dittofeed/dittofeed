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
import {
  CursorDirectionEnum,
  GetUsersRequest,
  SortOrderEnum,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import { NextRouter, useRouter } from "next/router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAppStore } from "../lib/appStore";
import { useDeleteUserMutation } from "../lib/useDeleteUserMutation";
import { useUserPropertyResourcesQuery } from "../lib/useUserPropertyResourcesQuery";
import { useUsersCountQuery } from "../lib/useUsersCountQuery";
import { useUsersQuery } from "../lib/useUsersQuery";
import { GreyButton } from "./greyButtonStyle";
import { greyTextFieldStyles } from "./greyScaleStyles";
import { SquarePaper } from "./squarePaper";
import { SortBySelector } from "./usersTable/sortBySelector";
import { UsersFilterV2 } from "./usersTable/usersFilterV2";
import {
  createUsersTableStore,
  UsersTableStore,
  UsersTableStoreInitialState,
} from "./usersTable/usersTableStore";

// ============================================================================
// Store Context Setup
// ============================================================================

// Context to hold the store instance
const UsersTableStoreContext = createContext<ReturnType<
  typeof createUsersTableStore
> | null>(null);

// Hook to access the store
function useUsersTableStore(): UsersTableStore {
  const store = useContext(UsersTableStoreContext);
  if (!store) {
    throw new Error(
      "useUsersTableStore must be used within a UsersTableStoreProvider",
    );
  }
  return store();
}

// ============================================================================
// Cell Components (unchanged from original)
// ============================================================================

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

const sortPropertyCellRenderer = ({
  getValue,
}: {
  getValue: () => unknown;
}) => {
  const value = getValue();
  if (value === null || value === undefined) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }
  return <Typography variant="body2">{String(value)}</Typography>;
};

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

// ============================================================================
// Exports for URL handling
// ============================================================================

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

// ============================================================================
// Types
// ============================================================================

interface Row {
  id: string;
  email: string;
  segments: {
    id: string;
    name: string;
  }[];
  sortPropertyValue?: string | number | boolean | null;
}

export type OnPaginationChangeProps = Pick<
  GetUsersRequest,
  "direction" | "cursor"
>;

export interface OnSortChangeProps {
  sortBy?: string | null;
}

export type UsersTableProps = Omit<GetUsersRequest, "workspaceId"> & {
  onPaginationChange?: (args: OnPaginationChangeProps) => void;
  onSortChange?: (args: OnSortChangeProps) => void;
  autoReloadByDefault?: boolean;
  reloadPeriodMs?: number;
  userUriTemplate?: string;
  hideControls?: boolean;
  negativeSegmentFilter?: string[];
};

// ============================================================================
// Inner Table Component (uses the store)
// ============================================================================

// Props used only for initial store state, not needed by the inner component
type InitialStoreProps =
  | "autoReloadByDefault"
  | "cursor"
  | "direction"
  | "limit"
  | "sortBy";

type UsersTableInnerProps = Omit<UsersTableProps, InitialStoreProps>;

function UsersTableInner({
  segmentFilter: segmentIds,
  subscriptionGroupFilter: subscriptionGroupIds,
  onPaginationChange,
  onSortChange,
  reloadPeriodMs = 10000,
  userUriTemplate = "/users/{userId}",
  hideControls = false,
}: UsersTableInnerProps) {
  useAppStore();

  // Get store state and actions
  const store = useUsersTableStore();
  const {
    autoReload,
    users,
    currentPageUserIds,
    nextCursor,
    previousCursor,
    sortBy,
    sortOrder,
    usersCount,
    segments,
    subscriptionGroups,
    userProperties,
    staticSegments,
    staticSubscriptionGroups,
  } = store;

  const {
    goToNextPage,
    goToPreviousPage,
    goToFirstPage,
    setSortBy,
    setSortOrder,
    setStaticSegments,
    setStaticSubscriptionGroups,
    addSegment,
    removeSegment,
    addSubscriptionGroup,
    removeSubscriptionGroup,
    addUserPropertyFilter,
    removeUserPropertyFilter,
    handleUsersResponse,
    setUsersCount,
    toggleAutoReload,
    getQueryParams,
    getFilterParams,
  } = store;

  // Sync static segments from props
  useEffect(() => {
    if (segmentIds) {
      setStaticSegments(segmentIds);
    }
  }, [segmentIds, setStaticSegments]);

  // Sync static subscription groups from props
  useEffect(() => {
    if (subscriptionGroupIds) {
      setStaticSubscriptionGroups(subscriptionGroupIds);
    }
  }, [subscriptionGroupIds, setStaticSubscriptionGroups]);

  // Query for users list
  const queryParams = getQueryParams();
  const usersListQuery = useUsersQuery(queryParams, {
    refetchInterval: autoReload ? reloadPeriodMs : false,
    placeholderData: keepPreviousData,
  });

  // Query for users count
  const filterParams = getFilterParams();
  const countQuery = useUsersCountQuery(filterParams, {
    refetchInterval: autoReload ? reloadPeriodMs : false,
    placeholderData: keepPreviousData,
  });

  // Query for user property names
  const userPropertiesQuery = useUserPropertyResourcesQuery();

  // Handle users list response
  useEffect(() => {
    if (usersListQuery.data) {
      handleUsersResponse(usersListQuery.data);
    }
  }, [usersListQuery.data, handleUsersResponse]);

  // Handle users count response
  useEffect(() => {
    if (countQuery.data !== undefined) {
      setUsersCount(countQuery.data);
    }
  }, [countQuery.data, setUsersCount]);

  // Get the name of the current sort property
  const sortPropertyName = useMemo(() => {
    if (!sortBy || sortBy === "id") {
      return null;
    }
    const properties = userPropertiesQuery.data?.userProperties ?? [];
    const found = properties.find((p) => p.id === sortBy);
    return found?.name ?? null;
  }, [sortBy, userPropertiesQuery.data]);

  // Transform store data to table rows
  const usersData = useMemo<Row[]>(() => {
    return currentPageUserIds.flatMap((id) => {
      const user = users[id];
      if (!user) {
        return [];
      }

      let email = "";
      let sortPropertyValue: string | number | boolean | null | undefined;

      for (const propId in user.properties) {
        const prop = user.properties[propId];
        if (prop && prop.name.toLowerCase() === "email") {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          email = prop.value as string;
        }
        if (sortBy && propId === sortBy && prop) {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          sortPropertyValue = prop.value as string | number | boolean | null;
        }
      }

      return [
        {
          id: user.id,
          email,
          segments: user.segments,
          sortPropertyValue,
        },
      ];
    });
  }, [currentPageUserIds, users, sortBy]);

  const actionsCellRenderer = useMemo(() => {
    return actionsCellRendererFactory();
  }, []);

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const baseColumns: ColumnDef<Row>[] = [
      {
        id: "id",
        header: "User ID",
        accessorKey: "id",
        cell: (info) => userIdCellRenderer({ ...info, userUriTemplate }),
      },
    ];

    // Add sort property column second (after User ID) if sorting by a user property
    // Skip if sorting by email since we already have an email column
    const isEmailSort = sortPropertyName?.toLowerCase() === "email";
    if (sortPropertyName && sortBy && sortBy !== "id" && !isEmailSort) {
      baseColumns.push({
        id: "sortProperty",
        header: sortPropertyName,
        accessorKey: "sortPropertyValue",
        cell: sortPropertyCellRenderer,
      });
    }

    baseColumns.push(
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
    );

    return baseColumns;
  }, [userUriTemplate, actionsCellRenderer, sortPropertyName, sortBy]);

  const table = useReactTable({
    columns,
    data: usersData,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  // Pagination handlers that also notify parent
  const handleNextPage = useCallback(() => {
    goToNextPage();
    onPaginationChange?.({
      cursor: nextCursor ?? undefined,
      direction: CursorDirectionEnum.After,
    });
  }, [goToNextPage, nextCursor, onPaginationChange]);

  const handlePreviousPage = useCallback(() => {
    goToPreviousPage();
    onPaginationChange?.({
      cursor: previousCursor ?? undefined,
      direction: CursorDirectionEnum.Before,
    });
  }, [goToPreviousPage, previousCursor, onPaginationChange]);

  const handleFirstPage = useCallback(() => {
    goToFirstPage();
    onPaginationChange?.({});
  }, [goToFirstPage, onPaginationChange]);

  const handleRefresh = useCallback(() => {
    usersListQuery.refetch();
    countQuery.refetch();
  }, [usersListQuery, countQuery]);

  const handleSortChange = useCallback(
    (newSortBy: string | null) => {
      setSortBy(newSortBy);
      onSortChange?.({ sortBy: newSortBy });
      onPaginationChange?.({});
    },
    [setSortBy, onSortChange, onPaginationChange],
  );

  const handleSortOrderChange = useCallback(
    (newSortOrder: SortOrderEnum) => {
      setSortOrder(newSortOrder);
      onPaginationChange?.({});
    },
    [setSortOrder, onPaginationChange],
  );

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
        <UsersFilterV2
          userProperties={userProperties}
          segments={segments}
          staticSegments={staticSegments}
          subscriptionGroups={subscriptionGroups}
          staticSubscriptionGroups={staticSubscriptionGroups}
          onRemoveSegment={removeSegment}
          onRemoveSubscriptionGroup={removeSubscriptionGroup}
          onRemoveUserProperty={removeUserPropertyFilter}
          onAddSegment={addSegment}
          onAddSubscriptionGroup={addSubscriptionGroup}
          onAddUserProperty={addUserPropertyFilter}
        />
        <SortBySelector
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortByChange={handleSortChange}
          onSortOrderChange={handleSortOrderChange}
        />
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
            onClick={toggleAutoReload}
            sx={{
              border: "1px solid",
              borderColor: "grey.400",
              bgcolor: autoReload ? "grey.600" : "inherit",
              color: autoReload ? "white" : "inherit",
              "&:hover": {
                bgcolor: autoReload ? "grey.700" : undefined,
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
                      onClick={handleFirstPage}
                      disabled={!previousCursor}
                      startIcon={<KeyboardDoubleArrowLeft />}
                    >
                      First
                    </GreyButton>
                    <GreyButton
                      onClick={handlePreviousPage}
                      disabled={!previousCursor}
                      startIcon={<KeyboardArrowLeft />}
                    >
                      Previous
                    </GreyButton>
                    <GreyButton
                      onClick={handleNextPage}
                      disabled={!nextCursor}
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
                          Total users: {countQuery.data ?? usersCount ?? 0}
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

// ============================================================================
// Main Component (wraps inner with store provider)
// ============================================================================

export default function UsersTableV2({
  segmentFilter,
  subscriptionGroupFilter,
  negativeSegmentFilter,
  cursor,
  direction,
  sortBy,
  limit,
  autoReloadByDefault,
  ...innerProps
}: UsersTableProps) {
  // Create a stable store instance that captures initial props
  const [store] = useState(() => {
    const initialState: UsersTableStoreInitialState = {
      staticSegmentIds: segmentFilter,
      staticSubscriptionGroupIds: subscriptionGroupFilter,
      negativeSegmentIds: negativeSegmentFilter,
      cursor: cursor ?? undefined,
      direction: direction ?? undefined,
      sortBy: sortBy ?? undefined,
      limit: limit ?? 10,
      autoReloadByDefault: autoReloadByDefault ?? false,
    };
    return createUsersTableStore(initialState);
  });

  return (
    <UsersTableStoreContext.Provider value={store}>
      <UsersTableInner
        segmentFilter={segmentFilter}
        subscriptionGroupFilter={subscriptionGroupFilter}
        {...innerProps}
      />
    </UsersTableStoreContext.Provider>
  );
}
