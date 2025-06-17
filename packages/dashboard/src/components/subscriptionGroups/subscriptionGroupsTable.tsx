import {
  Add as AddIcon,
  ArrowDownward,
  ArrowUpward,
  Computer,
  Delete as DeleteIcon,
  Home,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  KeyboardDoubleArrowRight,
  MoreVert as MoreVertIcon,
  OpenInNew as OpenInNewIcon,
  UnfoldMore,
} from "@mui/icons-material";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Snackbar,
  Stack,
  SxProps,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Theme,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import {
  CellContext,
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { AxiosError } from "axios";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import { CHANNEL_NAMES } from "isomorphic-lib/src/constants";
import {
  ChannelType,
  CompletionStatus,
  SavedSubscriptionGroupResource,
  SubscriptionGroupType,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { useAppStorePick } from "../../lib/appStore";
import { useCreateSubscriptionGroupMutation } from "../../lib/useCreateSubscriptionGroupMutation";
import { useDeleteSubscriptionGroupMutation } from "../../lib/useDeleteSubscriptionGroupMutation";
import {
  SUBSCRIPTION_GROUPS_QUERY_KEY,
  useSubscriptionGroupsQuery,
} from "../../lib/useSubscriptionGroupsQuery";
import { GreyButton, greyButtonStyle } from "../greyButtonStyle";

export type SubscriptionGroupsAllowedColumn =
  | "name"
  | "channel"
  | "type"
  | "updatedAt"
  | "actions";

export const DEFAULT_ALLOWED_SUBSCRIPTION_GROUPS_COLUMNS: SubscriptionGroupsAllowedColumn[] =
  ["name", "channel", "type", "updatedAt", "actions"];

type Row = SavedSubscriptionGroupResource;

function TimeCell({ getValue }: CellContext<Row, unknown>) {
  const timestamp = getValue<number | undefined>();
  if (!timestamp) {
    return null;
  }
  const date = new Date(timestamp);

  const tooltipContent = (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Computer sx={{ color: "text.secondary" }} />
        <Stack>
          <Typography variant="body2" color="text.secondary">
            Your device
          </Typography>
          <Typography>
            {new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "numeric",
              second: "numeric",
              hour12: true,
            }).format(date)}
          </Typography>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center">
        <Home sx={{ color: "text.secondary" }} />
        <Stack>
          <Typography variant="body2" color="text.secondary">
            UTC
          </Typography>
          <Typography>
            {new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "numeric",
              second: "numeric",
              hour12: true,
              timeZone: "UTC",
            }).format(date)}
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  );

  const formatted = formatDistanceToNow(date, { addSuffix: true });
  return (
    <Tooltip title={tooltipContent} placement="bottom-start" arrow>
      <Typography variant="body2">{formatted}</Typography>
    </Tooltip>
  );
}

function ActionsCell({ row, table }: CellContext<Row, unknown>) {
  const theme = useTheme();
  const rowId = row.original.id;

  const deleteSubscriptionGroup = table.options.meta?.deleteSubscriptionGroup;

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleDelete = () => {
    if (!deleteSubscriptionGroup) {
      console.error("deleteSubscriptionGroup function not found in table meta");
      return;
    }
    deleteSubscriptionGroup(rowId);
    handleClose();
  };

  return (
    <>
      <Tooltip title="Actions">
        <IconButton aria-label="actions" onClick={handleClick} size="small">
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": "actions-button",
        }}
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
            borderRadius: 1,
            boxShadow: theme.shadows[2],
          },
        }}
      >
        <MenuItem
          onClick={handleDelete}
          sx={{ color: theme.palette.error.main }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>
    </>
  );
}

function NameCell({ row, getValue }: CellContext<Row, unknown>) {
  const name = getValue<string>();
  const subscriptionGroupId = row.original.id;
  const href = `/subscription-groups/${subscriptionGroupId}`;

  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{ maxWidth: "350px" }}
    >
      <Tooltip title={name} placement="bottom-start">
        <Typography
          variant="body2"
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </Typography>
      </Tooltip>
      <Tooltip title="View Subscription Group Details">
        <IconButton size="small" component={Link} href={href}>
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

export function SubscriptionGroupsTable({
  sx,
  columnAllowList = DEFAULT_ALLOWED_SUBSCRIPTION_GROUPS_COLUMNS,
}: {
  sx?: SxProps<Theme>;
  columnAllowList?: SubscriptionGroupsAllowedColumn[];
}) {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [subscriptionGroupName, setSubscriptionGroupName] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<ChannelType>(
    ChannelType.Email,
  );
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const router = useRouter();

  const subscriptionGroupsQuery = useSubscriptionGroupsQuery();

  const subscriptionGroupsData: Row[] = useMemo(() => {
    return subscriptionGroupsQuery.data || [];
  }, [subscriptionGroupsQuery.data]);

  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  useEffect(() => {
    if (subscriptionGroupsQuery.isError) {
      setSnackbarMessage("Failed to load subscription groups.");
      setSnackbarOpen(true);
    }
  }, [subscriptionGroupsQuery.isError]);

  const deleteSubscriptionGroupMutation = useDeleteSubscriptionGroupMutation({
    onSuccess: () => {
      setSnackbarMessage("Subscription group deleted successfully!");
      setSnackbarOpen(true);
    },
    onError: () => {
      setSnackbarMessage("Failed to delete subscription group.");
      setSnackbarOpen(true);
    },
  });

  const createSubscriptionGroupMutation = useCreateSubscriptionGroupMutation({
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [SUBSCRIPTION_GROUPS_QUERY_KEY],
      });
      setSnackbarMessage("Subscription group created successfully!");
      setSnackbarOpen(true);
      setDialogOpen(false);
      setSubscriptionGroupName("");
      router.push(`/subscription-groups/${data.id}`);
    },
    onError: (error) => {
      console.error("Failed to create subscription group:", error);
      const errorMsg =
        (error as AxiosError<{ message?: string }>).response?.data.message ??
        "API Error";
      setSnackbarMessage(`Failed to create subscription group: ${errorMsg}`);
      setSnackbarOpen(true);
    },
  });

  const handleCreateSubscriptionGroup = () => {
    if (
      subscriptionGroupName.trim() &&
      !createSubscriptionGroupMutation.isPending
    ) {
      createSubscriptionGroupMutation.mutate({
        name: subscriptionGroupName.trim(),
        channel: selectedChannel,
        type: SubscriptionGroupType.OptOut,
      });
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setSubscriptionGroupName("");
    setSelectedChannel(ChannelType.Email);
  };

  const handleChannelChange = (event: SelectChangeEvent<ChannelType>) => {
    setSelectedChannel(event.target.value as ChannelType);
  };

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const columnDefinitions: Record<
      SubscriptionGroupsAllowedColumn,
      ColumnDef<Row>
    > = {
      name: {
        id: "name",
        header: "Name",
        accessorKey: "name",
        cell: NameCell,
      },
      channel: {
        id: "channel",
        header: "Channel",
        accessorKey: "channel",
        cell: ({ getValue }: CellContext<Row, unknown>) => {
          const channel = getValue<ChannelType>();
          return (
            <Typography variant="body2">{CHANNEL_NAMES[channel]}</Typography>
          );
        },
      },
      type: {
        id: "type",
        header: "Type",
        accessorKey: "type",
        cell: ({ getValue }: CellContext<Row, unknown>) => {
          const type = getValue<SubscriptionGroupType>();
          return <Typography variant="body2">{type}</Typography>;
        },
      },
      updatedAt: {
        id: "updatedAt",
        header: "Updated At",
        accessorKey: "updatedAt",
        cell: TimeCell,
      },
      actions: {
        id: "actions",
        header: "",
        size: 70,
        cell: ActionsCell,
        enableSorting: false,
      },
    };

    return columnAllowList.map((columnId) => columnDefinitions[columnId]);
  }, [columnAllowList]);

  const table = useReactTable({
    columns,
    data: subscriptionGroupsData,
    getSortedRowModel: getSortedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: {
      pagination,
      sorting,
    },
    meta: {
      deleteSubscriptionGroup: (subscriptionGroupId: string) => {
        if (deleteSubscriptionGroupMutation.isPending) return;
        deleteSubscriptionGroupMutation.mutate(subscriptionGroupId);
      },
    },
  });

  const isFetching =
    subscriptionGroupsQuery.isFetching || subscriptionGroupsQuery.isLoading;

  return (
    <>
      <Stack spacing={2} sx={{ width: "100%", height: "100%", ...sx }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h4">Subscription Groups</Typography>
          <Button
            variant="contained"
            onClick={() => setDialogOpen(true)}
            startIcon={<AddIcon />}
            sx={greyButtonStyle}
            disabled={workspace.type !== CompletionStatus.Successful}
          >
            New Subscription Group
          </Button>
        </Stack>
        <TableContainer component={Paper}>
          <Table stickyHeader>
            <TableHead>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableCell
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{
                        width:
                          header.getSize() !== 150
                            ? header.getSize()
                            : undefined,
                      }}
                      sortDirection={header.column.getIsSorted() || false}
                    >
                      {header.isPlaceholder ? null : (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            cursor: header.column.getCanSort()
                              ? "pointer"
                              : "default",
                          }}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getCanSort() && (
                            <IconButton
                              size="small"
                              sx={{ ml: 0.5 }}
                              aria-label={`Sort by ${header.column.columnDef.header}`}
                            >
                              {{
                                asc: <ArrowUpward fontSize="inherit" />,
                                desc: <ArrowDownward fontSize="inherit" />,
                              }[header.column.getIsSorted() as string] ?? (
                                <UnfoldMore
                                  fontSize="inherit"
                                  sx={{ opacity: 0.5 }}
                                />
                              )}
                            </IconButton>
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
                      backgroundColor: "action.hover",
                    },
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!isFetching && subscriptionGroupsData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} align="center">
                    No subscription groups found.{" "}
                    <Button
                      size="small"
                      onClick={() => setDialogOpen(true)}
                      sx={greyButtonStyle}
                    >
                      Create One
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter
              sx={{
                position: "sticky",
                bottom: 0,
                zIndex: 1,
              }}
            >
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  sx={{
                    bgcolor: "background.paper",
                    borderTop: (t) => `1px solid ${t.palette.divider}`,
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
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                        startIcon={<KeyboardDoubleArrowLeft />}
                      >
                        First
                      </GreyButton>
                      <GreyButton
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        startIcon={<KeyboardArrowLeft />}
                      >
                        Previous
                      </GreyButton>
                      <GreyButton
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        endIcon={<KeyboardArrowRight />}
                      >
                        Next
                      </GreyButton>
                      <GreyButton
                        onClick={() =>
                          table.setPageIndex(table.getPageCount() - 1)
                        }
                        disabled={!table.getCanNextPage()}
                        endIcon={<KeyboardDoubleArrowRight />}
                      >
                        Last
                      </GreyButton>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <Box
                        sx={{
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          minWidth: "40px",
                          justifyContent: "center",
                        }}
                      >
                        {isFetching && (
                          <CircularProgress color="inherit" size={20} />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        Page{" "}
                        <strong>
                          {table.getState().pagination.pageIndex + 1} of{" "}
                          {Math.max(1, table.getPageCount())}
                        </strong>
                      </Typography>
                    </Stack>
                  </Stack>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      </Stack>

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth="xs"
        fullWidth
        TransitionProps={{ onEntered: () => nameInputRef.current?.focus() }}
      >
        <DialogTitle>Create New Subscription Group</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              id="name"
              label="Subscription Group Name"
              type="text"
              fullWidth
              variant="outlined"
              value={subscriptionGroupName}
              onChange={(e) => setSubscriptionGroupName(e.target.value)}
              inputRef={nameInputRef}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleCreateSubscriptionGroup();
                }
              }}
            />
            <FormControl fullWidth variant="outlined">
              <InputLabel id="channel-select-label">Channel</InputLabel>
              <Select
                labelId="channel-select-label"
                id="channel-select"
                value={selectedChannel}
                label="Channel"
                onChange={handleChannelChange}
              >
                {Object.values(ChannelType).map((channel) => (
                  <MenuItem key={channel} value={channel}>
                    {CHANNEL_NAMES[channel]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            onClick={handleCreateSubscriptionGroup}
            disabled={
              !subscriptionGroupName.trim() ||
              createSubscriptionGroupMutation.isPending
            }
          >
            {createSubscriptionGroupMutation.isPending
              ? "Creating..."
              : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}

declare module "@tanstack/react-table" {
  interface TableMeta<TData = unknown> {
    deleteSubscriptionGroup?: (subscriptionGroupId: string) => void;
  }
}
