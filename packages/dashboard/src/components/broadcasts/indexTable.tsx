import {
  Add as AddIcon,
  Archive as ArchiveIcon,
  ArrowDownward,
  ArrowUpward,
  Computer,
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
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import axios from "axios";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import {
  BroadcastResource,
  BroadcastResourceV2,
  BroadcastV2Config,
  ChannelType,
  CompletionStatus,
  UpdateBroadcastArchiveRequest,
  UpsertBroadcastV2Request,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { useAppStorePick } from "../../lib/appStore";
import { useUniversalRouter } from "../../lib/authModeProvider";
import { useBroadcastsQuery } from "../../lib/useBroadcastsQuery";
import { GreyButton, greyButtonStyle } from "../greyButtonStyle";

// Use the union type for the table row data
type Row = BroadcastResource | BroadcastResourceV2;

// Helper function to format status strings
function humanizeBroadcastStatus(status: string): string {
  switch (status) {
    case "NotStarted":
      return "Not Started";
    case "InProgress":
      return "In Progress";
    case "Triggered": // V1 status, might map to Running/Completed in practice
      return "Triggered (V1)"; // Clarify V1 status if needed
    case "Draft":
      return "Draft";
    case "Scheduled":
      return "Scheduled";
    case "Running":
      return "Running";
    case "Paused":
      return "Paused";
    case "Completed":
      return "Completed";
    case "Cancelled":
      return "Cancelled";
    case "Failed":
      return "Failed";
    default:
      return status; // Return original if unknown
  }
}

// Cell renderer for Actions column
function ActionsCell({ row, table }: CellContext<Row, unknown>) {
  const theme = useTheme();
  const rowId = row.original.id;

  // Access archive function from table meta
  const archiveBroadcast = table.options.meta?.archiveBroadcast;

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleArchive = () => {
    if (!archiveBroadcast) {
      console.error("archiveBroadcast function not found in table meta");
      return;
    }
    archiveBroadcast(rowId);
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
          onClick={handleArchive}
          sx={{ color: theme.palette.grey[700] }}
        >
          <ArchiveIcon fontSize="small" sx={{ mr: 1 }} />
          Archive
        </MenuItem>
        {/* Add other actions like Edit, Delete, etc. here */}
      </Menu>
    </>
  );
}

// Cell renderer for Name column
function NameCell({ row, getValue }: CellContext<Row, unknown>) {
  const name = getValue<string>();
  const broadcastId = row.original.id;

  const isV2 = "version" in row.original && row.original.version === "V2";
  const href = isV2
    ? `/broadcasts/v2?id=${broadcastId}`
    : `/broadcasts/${broadcastId}`;

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
      <Tooltip title="View Broadcast Details">
        <IconButton size="small" component={Link} href={href}>
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

// Cell renderer for Status column
function StatusCell({ getValue }: CellContext<Row, unknown>) {
  const rawStatus = getValue<string>();
  const humanizedStatus = humanizeBroadcastStatus(rawStatus);
  // TODO: Consider using MUI Chip for better visual styling
  return <Typography variant="body2">{humanizedStatus}</Typography>;
}

// TimeCell for displaying timestamps like createdAt
function TimeCell({ getValue }: CellContext<Row, unknown>) {
  const timestamp = getValue<number>();
  if (!timestamp) {
    return null; // Or some placeholder
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

// ScheduledAtCell for displaying the naive scheduledAt string
// This cell needs to handle the case where the property might not exist (V1)
function ScheduledAtCell({ row }: CellContext<Row, unknown>) {
  // Access scheduledAt only if it's a V2 resource
  const value =
    "scheduledAt" in row.original ? row.original.scheduledAt : undefined;
  const timezone =
    "config" in row.original ? row.original.config.defaultTimezone : undefined;

  if (!value) {
    return null; // V1 broadcasts or V2 without schedule won't show anything
  }

  // Simple display of the naive string, maybe format slightly if needed
  // Example: Remove seconds if present 'YYYY-MM-DD HH:MM:SS' -> 'YYYY-MM-DD HH:MM'
  const formattedValue = value.substring(0, 16);

  return (
    <Tooltip title={`${value} (${timezone})`} placement="bottom-start" arrow>
      <Typography variant="body2">{formattedValue}</Typography>
    </Tooltip>
  );
}

export default function BroadcastsTable() {
  const theme = useTheme();
  const universalRouter = useUniversalRouter();
  const queryClient = useQueryClient();
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [broadcastName, setBroadcastName] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<
    BroadcastV2Config["message"]["type"]
  >(ChannelType.Email);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  const query = useBroadcastsQuery();

  // query.data is (BroadcastResource | BroadcastResourceV2)[]
  const rawData: Row[] = query.data ?? [];

  // Filter data based on showArchived state
  const broadcastsData: Row[] = useMemo(() => {
    if (showArchived) {
      return rawData;
    }
    // Assuming an 'archived' property exists on Row type items
    return rawData.filter((b) => !b.archived);
  }, [rawData, showArchived]);

  const [pagination, setPagination] = useState({
    pageIndex: 0, // initial page index
    pageSize: 10, // default page size
  });

  // Effect to show snackbar on load error
  useEffect(() => {
    if (query.isError) {
      setSnackbarMessage("Failed to load broadcasts.");
      setSnackbarOpen(true);
    }
  }, [query.isError]);

  const archiveBroadcastMutation = useMutation({
    mutationFn: async (broadcastId: string) => {
      if (!workspace || workspace.type !== CompletionStatus.Successful) {
        throw new Error("Workspace not available");
      }
      const requestData: UpdateBroadcastArchiveRequest = {
        workspaceId: workspace.value.id,
        broadcastId,
        archived: true, // Explicitly set to true for archiving
      };
      await axios.put(`${apiBase}/api/broadcasts/archive`, requestData);
    },
    onSuccess: (_, broadcastId) => {
      console.log("Archived broadcast:", broadcastId);
      // Invalidate the broadcasts query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      setSnackbarMessage("Broadcast archived successfully!");
      setSnackbarOpen(true);
    },
    onError: (error, broadcastId) => {
      console.error(`Failed to archive broadcast ${broadcastId}:`, error);
      setSnackbarMessage("Failed to archive broadcast.");
      setSnackbarOpen(true);
    },
  });

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    return [
      {
        id: "name",
        header: "Name",
        accessorKey: "name",
        cell: NameCell,
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        cell: StatusCell,
      },
      {
        id: "createdAt",
        header: "Created At",
        accessorKey: "createdAt",
        cell: TimeCell,
      },
      {
        id: "scheduledAt",
        header: "Scheduled At",
        accessorKey: "scheduledAt",
        cell: ScheduledAtCell,
      },
      {
        id: "actions",
        header: "",
        size: 70, // Adjust size as needed
        cell: ActionsCell, // Use direct cell renderer
      },
    ];
  }, []); // No dependency needed now

  const table = useReactTable({
    columns,
    data: broadcastsData,
    getSortedRowModel: getSortedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: {
      pagination,
      sorting,
    },
    // Pass the archive function via meta
    meta: {
      archiveBroadcast: (broadcastId: string) => {
        if (archiveBroadcastMutation.isPending) return;
        archiveBroadcastMutation.mutate(broadcastId);
      },
    },
  });

  const createBroadcastMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!workspace || workspace.type !== CompletionStatus.Successful) {
        throw new Error("Workspace not available");
      }
      let broadcastConfigMessage: BroadcastV2Config["message"];
      switch (selectedChannel) {
        case ChannelType.Email:
          broadcastConfigMessage = {
            type: ChannelType.Email,
          };
          break;
        case ChannelType.Sms:
          broadcastConfigMessage = {
            type: ChannelType.Sms,
          };
          break;
        case ChannelType.Webhook:
          broadcastConfigMessage = {
            type: ChannelType.Webhook,
          };
          break;
      }
      const requestData: UpsertBroadcastV2Request = {
        workspaceId: workspace.value.id,
        // id is omitted for creation
        name,
        config: {
          // Minimal default config
          type: "V2",
          message: broadcastConfigMessage,
        },
      };
      const response = await axios.put<BroadcastResourceV2>(
        `${apiBase}/api/broadcasts/v2`,
        requestData,
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      setSnackbarMessage("Broadcast created successfully!");
      setSnackbarOpen(true);
      setDialogOpen(false);
      setBroadcastName("");
      universalRouter.push(`/broadcasts/v2`, { id: data.id });
    },
    onError: (error) => {
      console.error("Failed to create broadcast:", error);
      setSnackbarMessage("Failed to create broadcast.");
      setSnackbarOpen(true);
    },
  });

  const handleCreateBroadcast = () => {
    if (broadcastName.trim() && !createBroadcastMutation.isPending) {
      createBroadcastMutation.mutate(broadcastName.trim());
    }
  };

  // Handle channel type selection
  const handleChannelChange = (
    event: React.MouseEvent<HTMLElement>,
    newChannel: BroadcastV2Config["message"]["type"] | null,
  ) => {
    if (newChannel !== null) {
      setSelectedChannel(newChannel);
    }
  };

  // Handle dialog close with reset
  const closeDialog = () => {
    setDialogOpen(false);
    setBroadcastName("");
    setSelectedChannel(ChannelType.Email);
  };

  return (
    <>
      <Stack spacing={2} sx={{ padding: theme.spacing(3), width: "100%" }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h4">Broadcasts</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControlLabel
              control={
                <Switch
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": {
                      color: theme.palette.grey[500],
                    },
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                      backgroundColor: theme.palette.grey[500],
                    },
                  }}
                />
              }
              label="Show Archived"
            />
            <Button
              variant="contained"
              sx={greyButtonStyle}
              onClick={() => setDialogOpen(true)}
              startIcon={<AddIcon />}
            >
              New Broadcast
            </Button>
          </Stack>
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
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getCanSort() && (
                            <IconButton
                              onClick={header.column.getToggleSortingHandler()}
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
                                /> // Default icon when not sorted
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
              {/* Handle empty state only when not loading and data is truly empty */}
              {!query.isFetching &&
                !query.isLoading &&
                broadcastsData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={columns.length} align="center">
                      No broadcasts found.
                    </TableCell>
                  </TableRow>
                )}
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
                    borderTop: (t) => `1px solid ${t.palette.divider}`,
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={2}
                    justifyContent="space-between" // Space out pagination and loader
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
                      {/* Loading indicator similar to deliveriesTableV2 */}
                      <Box
                        sx={{
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          minWidth: "40px", // Prevent layout shift
                          justifyContent: "center",
                        }}
                      >
                        {query.isFetching && (
                          <CircularProgress color="inherit" size={20} />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        Page{" "}
                        <strong>
                          {table.getState().pagination.pageIndex + 1} of{" "}
                          {table.getPageCount() === 0
                            ? 1
                            : table.getPageCount()}
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

      {/* Create Broadcast Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth="sm"
        fullWidth
        TransitionProps={{ onEntered: () => nameInputRef.current?.focus() }}
      >
        <DialogTitle>Create New Broadcast</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            id="name"
            label="Broadcast Name"
            type="text"
            fullWidth
            variant="standard"
            value={broadcastName}
            onChange={(e) => setBroadcastName(e.target.value)}
            inputRef={nameInputRef}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleCreateBroadcast();
              }
            }}
          />
          <Typography display="block" sx={{ mt: 2, mb: 1 }}>
            Channel Type
          </Typography>
          <ToggleButtonGroup
            value={selectedChannel}
            exclusive
            onChange={handleChannelChange}
            aria-label="channel type"
            size="small"
          >
            <ToggleButton value={ChannelType.Email} aria-label="Email">
              Email
            </ToggleButton>
            <ToggleButton value={ChannelType.Sms} aria-label="SMS">
              SMS
            </ToggleButton>
            <ToggleButton value={ChannelType.Webhook} aria-label="Webhook">
              Webhook
            </ToggleButton>
          </ToggleButtonGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            onClick={handleCreateBroadcast}
            disabled={
              !broadcastName.trim() || createBroadcastMutation.isPending
            }
          >
            {createBroadcastMutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for feedback (now includes load errors) */}
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

// Add type definition for table meta
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData = unknown> {
    archiveBroadcast?: (broadcastId: string) => void;
  }
}
