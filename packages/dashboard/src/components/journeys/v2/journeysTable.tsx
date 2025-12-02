import {
  Add as AddIcon,
  ArrowDownward,
  ArrowUpward,
  Computer,
  ContentCopy as ContentCopyIcon,
  Delete as DeleteIcon,
  Home,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  KeyboardDoubleArrowRight,
  MoreVert as MoreVertIcon,
  OpenInNew as OpenInNewIcon,
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
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
  IconButton,
  Menu,
  MenuItem,
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
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
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
import {
  DuplicateResourceTypeEnum,
  GetJourneysResponseItem,
  JourneyResourceStatus,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { useUniversalRouter } from "../../../lib/authModeProvider";
import { useCreateJourneyMutation } from "../../../lib/useCreateJourneyMutation";
import { useDeleteJourneyMutation } from "../../../lib/useDeleteJourneyMutation";
import { useDuplicateResourceMutation } from "../../../lib/useDuplicateResourceMutation";
import { useJourneyMutation } from "../../../lib/useJourneyMutation";
import { useJourneysQuery } from "../../../lib/useJourneysQuery";
import { GreyButton, greyButtonStyle } from "../../greyButtonStyle";
import { DEFAULT_EDGES, DEFAULT_JOURNEY_NODES } from "../defaults";
import { JourneyStateForDraft, journeyStateToDraft } from "../store";

type Row = GetJourneysResponseItem;

function humanizeJourneyStatus(status: JourneyResourceStatus): string {
  switch (status) {
    case "NotStarted":
      return "Not Started";
    case "Running":
      return "Running";
    case "Paused":
      return "Paused";
    case "Broadcast":
      return "Broadcast";
    default:
      return status;
  }
}

function ActionsCell({ row, table }: CellContext<Row, unknown>) {
  const theme = useTheme();
  const { id, status } = row.original;
  const rowName = row.original.name;
  const router = useUniversalRouter();
  const journeyMutation = useJourneyMutation(id);
  const deleteJourneyMutation = useDeleteJourneyMutation();

  // Access functions from table meta
  const duplicateJourney = table.options.meta?.duplicateJourney;

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleToggleStatus = () => {
    const newStatus = status === "Running" ? "Paused" : "Running";
    journeyMutation.mutate({
      status: newStatus,
    });
    handleClose();
  };

  const handleDuplicate = () => {
    if (!duplicateJourney) {
      console.error("duplicateJourney function not found in table meta");
      return;
    }
    duplicateJourney(rowName);
    handleClose();
  };

  const handleDelete = () => {
    deleteJourneyMutation.mutate(id);
    handleClose();
  };

  const handleEdit = () => {
    router.push(`/journeys/v2`, { id });
    handleClose();
  };

  const isToggleInProgress = journeyMutation.isPending;
  const isDeleteInProgress = deleteJourneyMutation.isPending;
  const isActionInProgress = isToggleInProgress || isDeleteInProgress;

  return (
    <>
      <Tooltip title="Actions">
        <IconButton
          aria-label="actions"
          onClick={handleClick}
          size="small"
          disabled={isActionInProgress}
        >
          {isActionInProgress ? (
            <CircularProgress size={20} />
          ) : (
            <MoreVertIcon fontSize="small" />
          )}
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
        <MenuItem onClick={handleEdit}>
          <OpenInNewIcon fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        {(status === "Running" || status === "Paused") && (
          <MenuItem onClick={handleToggleStatus} disabled={isToggleInProgress}>
            {status === "Running" ? (
              <>
                <PauseIcon fontSize="small" sx={{ mr: 1 }} />
                Pause
              </>
            ) : (
              <>
                <PlayArrowIcon fontSize="small" sx={{ mr: 1 }} />
                Start
              </>
            )}
          </MenuItem>
        )}
        <MenuItem onClick={handleDuplicate}>
          <ContentCopyIcon fontSize="small" sx={{ mr: 1 }} />
          Duplicate
        </MenuItem>
        <MenuItem
          onClick={handleDelete}
          sx={{ color: theme.palette.error.main }}
          disabled={isDeleteInProgress}
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
  const journeyId = row.original.id;
  const universalRouter = useUniversalRouter();
  const href = universalRouter.mapUrl(`/journeys/v2`, { id: journeyId });

  return (
    <Stack direction="row" spacing={1} alignItems="center">
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
      <Tooltip title="Edit Journey">
        <IconButton size="small" component={Link} href={href}>
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function StatusCell({ getValue }: CellContext<Row, unknown>) {
  const rawStatus = getValue<JourneyResourceStatus>();
  return (
    <Typography variant="body2">{humanizeJourneyStatus(rawStatus)}</Typography>
  );
}

function TimeCell({ getValue }: CellContext<Row, unknown>) {
  const timestamp = getValue<number>();
  if (!timestamp) return null;
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

export default function JourneysTable() {
  const router = useUniversalRouter();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [journeyName, setJourneyName] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  const query = useJourneysQuery({
    resourceType: "Declarative",
  });
  const createJourneyMutation = useCreateJourneyMutation();
  const journeysData: Row[] = useMemo(
    () => query.data?.journeys ?? [],
    [query.data],
  );

  useEffect(() => {
    if (query.isError) {
      setSnackbarMessage("Failed to load journeys.");
      setSnackbarOpen(true);
    }
  }, [query.isError]);

  const duplicateJourneyMutation = useDuplicateResourceMutation({
    onSuccess: (data) => {
      setSnackbarMessage(`Journey duplicated as "${data.name}"!`);
      setSnackbarOpen(true);
    },
    onError: (error) => {
      console.error("Failed to duplicate journey:", error);
      const errorMsg =
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        (error as AxiosError<{ message?: string }>).response?.data.message ??
        "API Error";
      setSnackbarMessage(`Failed to duplicate journey: ${errorMsg}`);
      setSnackbarOpen(true);
    },
  });

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
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
        id: "actions",
        header: "",
        size: 70,
        cell: ActionsCell,
      },
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: journeysData,
    getSortedRowModel: getSortedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: {
      pagination,
      sorting,
    },
    // Pass functions via meta
    meta: {
      duplicateJourney: (name: string) => {
        if (duplicateJourneyMutation.isPending) return;
        duplicateJourneyMutation.mutate({
          name,
          resourceType: DuplicateResourceTypeEnum.Journey,
        });
      },
    },
  });

  const handleCreateJourney = () => {
    if (journeyName.trim() && !createJourneyMutation.isPending) {
      const stateForDraft: JourneyStateForDraft = {
        journeyNodes: DEFAULT_JOURNEY_NODES,
        journeyEdges: DEFAULT_EDGES,
      };
      const draft = journeyStateToDraft(stateForDraft);

      createJourneyMutation.mutate(
        { name: journeyName.trim(), draft },
        {
          onSuccess: (data) => {
            setSnackbarMessage("Journey created successfully!");
            setSnackbarOpen(true);
            setDialogOpen(false);
            setJourneyName("");
            router.push(`/journeys/v2`, { id: data.id });
          },
          onError: () => {
            setSnackbarMessage("Failed to create journey.");
            setSnackbarOpen(true);
          },
        },
      );
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setJourneyName("");
  };

  return (
    <>
      <Stack spacing={2} sx={{ height: "100%", width: "100%" }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h4">Journeys</Typography>
          <Button
            variant="contained"
            sx={greyButtonStyle}
            onClick={() => setDialogOpen(true)}
            startIcon={<AddIcon />}
          >
            New Journey
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
                                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
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
                <TableRow key={row.id} hover>
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
              {!query.isFetching &&
                !query.isLoading &&
                journeysData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={columns.length} align="center">
                      No journeys found.
                    </TableCell>
                  </TableRow>
                )}
            </TableBody>
            <TableFooter sx={{ position: "sticky", bottom: 0 }}>
              <TableRow>
                <TableCell colSpan={table.getAllColumns().length}>
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

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth="sm"
        fullWidth
        TransitionProps={{ onEntered: () => nameInputRef.current?.focus() }}
      >
        <DialogTitle>Create New Journey</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            id="name"
            label="Journey Name"
            type="text"
            fullWidth
            variant="standard"
            value={journeyName}
            onChange={(e) => setJourneyName(e.target.value)}
            inputRef={nameInputRef}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleCreateJourney();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            onClick={handleCreateJourney}
            disabled={!journeyName.trim() || createJourneyMutation.isPending}
          >
            {createJourneyMutation.isPending ? "Creating..." : "Create"}
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

// Add type definition for table meta
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData = unknown> {
    duplicateJourney?: (journeyName: string) => void;
  }
}
