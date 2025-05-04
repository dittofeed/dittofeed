import {
  Add as AddIcon,
  ArrowDownward,
  ArrowUpward,
  Computer,
  Delete as DeleteIcon,
  DownloadForOffline,
  Home,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  KeyboardDoubleArrowRight,
  MoreVert as MoreVertIcon,
  OpenInNew as OpenInNewIcon,
  UnfoldMore,
} from "@mui/icons-material";
import { LoadingButton } from "@mui/lab";
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
import { DEFAULT_SEGMENT_DEFINITION } from "isomorphic-lib/src/constants";
import {
  CompletionStatus,
  ComputedPropertyPeriod,
  MinimalJourneysResource,
  SegmentDefinition,
  SegmentResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import DashboardContent from "../../components/dashboardContent";
import { GreyButton, greyButtonStyle } from "../../components/greyButtonStyle";
import { RelatedResourceSelect } from "../../components/resourceTable";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { useAppStorePick } from "../../lib/appStore";
import { requestContext } from "../../lib/requestContext";
import { PropsWithInitialState } from "../../lib/types";
import { useComputedPropertyPeriodsQuery } from "../../lib/useComputedPropertyPeriodsQuery";
import { useDeleteSegmentMutation } from "../../lib/useDeleteSegmentMutation";
import { useDownloadSegmentsMutation } from "../../lib/useDownloadSegmentsMutation";
import { useResourcesQuery } from "../../lib/useResourcesQuery";
import {
  SEGMENTS_QUERY_KEY,
  useSegmentsQuery,
} from "../../lib/useSegmentsQuery";
import { useUpdateSegmentsMutation } from "../../lib/useUpdateSegmentsMutation";

type SegmentsProps = PropsWithInitialState;

export const getServerSideProps: GetServerSideProps<SegmentsProps> =
  requestContext(async (_ctx, dfContext) => {
    return {
      props: addInitialStateToProps({
        props: {},
        dfContext,
      }),
    };
  });

type Row = Omit<SegmentResource, "lastRecomputedAt"> & {
  lastRecomputed?: number;
  journeysUsedBy: MinimalJourneysResource[];
};

// TimeCell for displaying timestamps like createdAt
function TimeCell({ getValue }: CellContext<Row, unknown>) {
  const timestamp = getValue<number | undefined>();
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

// Cell renderer for Actions column
function ActionsCell({ row, table }: CellContext<Row, unknown>) {
  const theme = useTheme();
  const rowId = row.original.id;

  // Access delete function from table meta
  const deleteSegment = table.options.meta?.deleteSegment;

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleDelete = () => {
    if (!deleteSegment) {
      console.error("deleteSegment function not found in table meta");
      return;
    }
    deleteSegment(rowId);
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

// Cell renderer for Name column
function NameCell({ row, getValue }: CellContext<Row, unknown>) {
  const name = getValue<string>();
  const segmentId = row.original.id;
  const href = `/segments/${segmentId}`;

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
      <Tooltip title="View Segment Details">
        <IconButton size="small" component={Link} href={href}>
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function JourneysCell({ getValue }: CellContext<Row, unknown>) {
  const journeys = getValue<MinimalJourneysResource[]>();

  if (!journeys || journeys.length === 0) {
    return null; // Or return <Typography variant="body2">-</Typography>; if preferred
  }

  const relatedLabel = `${journeys.length} ${journeys.length === 1 ? "Journey" : "Journeys"}`;

  // Restore the relatedResources variable
  const relatedResources = journeys.map((journey) => ({
    href: `/journeys/${journey.id}`,
    name: journey.name,
  }));

  return (
    <RelatedResourceSelect
      label={relatedLabel}
      relatedResources={relatedResources}
    />
  );
}

export default function SegmentList() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["apiBase", "workspace"]);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [segmentName, setSegmentName] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const { data: computedPropertyPeriods } = useComputedPropertyPeriodsQuery({
    step: "ComputeAssignments",
  });
  const { data: resources } = useResourcesQuery({
    journeys: {
      segments: true,
    },
  });

  const segmentsQuery = useSegmentsQuery({
    resourceType: "Declarative",
  });

  const segmentsData: Row[] = useMemo(() => {
    if (!segmentsQuery.data?.segments) {
      return [];
    }
    const periodBySegmentId = new Map<string, ComputedPropertyPeriod>();
    for (const period of computedPropertyPeriods?.periods ?? []) {
      if (period.type === "Segment") {
        periodBySegmentId.set(period.id, period);
      }
    }
    const journeysBySegmentId = new Map<string, MinimalJourneysResource[]>();
    for (const journey of resources?.journeys ?? []) {
      for (const journeySegment of journey.segments ?? []) {
        const existingJourneys = journeysBySegmentId.get(journeySegment) ?? [];
        existingJourneys.push(journey);
        journeysBySegmentId.set(journeySegment, existingJourneys);
      }
    }
    return segmentsQuery.data.segments.map((segment) => ({
      ...segment,
      lastRecomputedAt: periodBySegmentId.get(segment.id)?.lastRecomputed,
      journeysUsedBy: journeysBySegmentId.get(segment.id) ?? [],
    }));
  }, [
    segmentsQuery.data?.segments,
    computedPropertyPeriods?.periods,
    resources?.journeys,
  ]);

  const [pagination, setPagination] = useState({
    pageIndex: 0, // initial page index
    pageSize: 10, // default page size
  });

  useEffect(() => {
    if (segmentsQuery.isError) {
      setSnackbarMessage("Failed to load segments.");
      setSnackbarOpen(true);
    }
  }, [segmentsQuery.isError]);

  const deleteSegmentMutation = useDeleteSegmentMutation({
    onSuccess: () => {
      setSnackbarMessage("Segment deleted successfully!");
      setSnackbarOpen(true);
    },
    onError: () => {
      setSnackbarMessage("Failed to delete segment.");
      setSnackbarOpen(true);
    },
  });

  const createSegmentMutation = useUpdateSegmentsMutation({
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [SEGMENTS_QUERY_KEY] });
      setSnackbarMessage("Segment created successfully!");
      setSnackbarOpen(true);
      setDialogOpen(false);
      setSegmentName("");
      router.push(`/segments/${data.id}`); // Redirect to the edit page
    },
    onError: (error) => {
      console.error("Failed to create segment:", error);
      const errorMsg = error.response?.data.message ?? "API Error";
      setSnackbarMessage(`Failed to create segment: ${errorMsg}`);
      setSnackbarOpen(true);
    },
  });

  const downloadMutation = useDownloadSegmentsMutation({
    onSuccess: () => {
      setSnackbarMessage("Downloaded user segment assignments.");
      setSnackbarOpen(true);
    },
    onError: (error) => {
      console.error("Failed to download segments:", error);
      const errorMsg =
        (error as AxiosError<{ message?: string }>).response?.data.message ??
        "API Error";
      setSnackbarMessage(
        `Failed to download user segment assignments: ${errorMsg}`,
      );
      setSnackbarOpen(true);
    },
  });

  const handleCreateSegment = () => {
    if (segmentName.trim() && !createSegmentMutation.isPending) {
      const newSegmentId = uuid();
      const definition: SegmentDefinition = DEFAULT_SEGMENT_DEFINITION;
      createSegmentMutation.mutate({
        id: newSegmentId,
        name: segmentName.trim(),
        definition,
      });
    }
  };

  // Handle dialog close with reset
  const closeDialog = () => {
    setDialogOpen(false);
    setSegmentName("");
  };

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    return [
      {
        id: "name",
        header: "Name",
        accessorKey: "name",
        cell: NameCell,
      },
      {
        id: "journeysUsedBy",
        header: "Journeys Used By",
        accessorKey: "journeysUsedBy",
        cell: JourneysCell,
        enableSorting: false,
      },
      {
        id: "lastRecomputed",
        header: "Last Recomputed",
        accessorKey: "lastRecomputedAt", // Assuming this key exists from API
        cell: TimeCell, // Use TimeCell or a custom formatter
      },
      {
        id: "updatedAt",
        header: "Updated At",
        accessorKey: "updatedAt",
        cell: TimeCell,
      },
      {
        id: "actions",
        header: "",
        size: 70, // Adjust size as needed
        cell: ActionsCell,
        enableSorting: false,
      },
    ];
  }, []); // Dependencies will be added if needed

  const table = useReactTable({
    columns,
    data: segmentsData,
    getSortedRowModel: getSortedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: {
      pagination,
      sorting,
    },
    // Pass the delete function via meta
    meta: {
      deleteSegment: (segmentId: string) => {
        if (deleteSegmentMutation.isPending) return;
        // Optional: Add confirmation dialog here
        deleteSegmentMutation.mutate(segmentId);
      },
    },
  });

  const isFetching = segmentsQuery.isFetching || segmentsQuery.isLoading;

  return (
    <DashboardContent>
      <Stack spacing={2} sx={{ padding: theme.spacing(3), width: "100%" }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h4">Segments</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="download user segments" placement="right" arrow>
              <LoadingButton
                loading={downloadMutation.isPending}
                variant="contained"
                startIcon={<DownloadForOffline />}
                onClick={() => downloadMutation.mutate()}
                disabled={workspace.type !== CompletionStatus.Successful}
                sx={greyButtonStyle}
              >
                Download User Segments
              </LoadingButton>
            </Tooltip>
            <Button
              variant="contained"
              onClick={() => setDialogOpen(true)}
              startIcon={<AddIcon />}
              sx={greyButtonStyle}
            >
              New Segment
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
              {!isFetching && segmentsData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} align="center">
                    No segments found.{" "}
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
                zIndex: 1, // Ensure footer is above table content
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
                          minWidth: "40px", // Prevent layout shift
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

      {/* Create Segment Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth="xs"
        fullWidth
        TransitionProps={{ onEntered: () => nameInputRef.current?.focus() }}
      >
        <DialogTitle>Create New Segment</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            id="name"
            label="Segment Name"
            type="text"
            fullWidth
            variant="standard"
            value={segmentName}
            onChange={(e) => setSegmentName(e.target.value)}
            inputRef={nameInputRef}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleCreateSegment();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            onClick={handleCreateSegment}
            disabled={!segmentName.trim() || createSegmentMutation.isPending}
          >
            {createSegmentMutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for feedback */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </DashboardContent>
  );
}

// Add type definition for table meta
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData = unknown> {
    deleteSegment?: (segmentId: string) => void;
  }
}
