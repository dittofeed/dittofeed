import {
  Add as AddIcon,
  ArrowDownward,
  ArrowUpward,
  Computer,
  ContentCopy as ContentCopyIcon,
  Delete as DeleteIcon,
  DownloadForOffline,
  Home,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  KeyboardDoubleArrowRight,
  MoreVert as MoreVertIcon,
  OpenInNew as OpenInNewIcon,
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
  Replay as ReplayIcon,
  Search as SearchIcon,
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
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
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
  FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
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
  DuplicateResourceTypeEnum,
  MinimalJourneysResource,
  SegmentDefinition,
  SegmentResource,
  SegmentStatusEnum,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import { useAppStorePick } from "../../lib/appStore";
import { useUniversalRouter } from "../../lib/authModeProvider";
import { useComputedPropertyPeriodsQuery } from "../../lib/useComputedPropertyPeriodsQuery";
import { useDeleteSegmentMutation } from "../../lib/useDeleteSegmentMutation";
import { useDownloadSegmentsMutation } from "../../lib/useDownloadSegmentsMutation";
import { useDuplicateResourceMutation } from "../../lib/useDuplicateResourceMutation";
import { useRecomputeSegmentMutation } from "../../lib/useRecomputeSegmentMutation";
import { useResourcesQuery } from "../../lib/useResourcesQuery";
import {
  SEGMENTS_QUERY_KEY,
  useSegmentsQuery,
} from "../../lib/useSegmentsQuery";
import { useSegmentStatusMutation } from "../../lib/useSegmentStatusMutation";
import { useUpdateSegmentsMutation } from "../../lib/useUpdateSegmentsMutation";
import { GreyButton, greyButtonStyle } from "../greyButtonStyle";
import { RelatedResourceSelect } from "../resourceTable";

export type SegmentsAllowedColumn =
  | "id"
  | "name"
  | "description"
  | "totalUsers"
  | "status"
  | "journeysUsedBy"
  | "lastRecomputed"
  | "liveStatus"
  | "updatedAt"
  | "actions";

export const DEFAULT_ALLOWED_SEGMENTS_COLUMNS: SegmentsAllowedColumn[] = [
  "id",
  "name",
  "description",
  "totalUsers",
  "status",
  "journeysUsedBy",
  "lastRecomputed",
  "liveStatus",
  "updatedAt",
  "actions",
];

type Row = SegmentResource & {
  journeysUsedBy: MinimalJourneysResource[];
  lastRecomputedAt?: number;
};

const segmentSearchFilter: FilterFn<Row> = (row, _columnId, filterValue) => {
  const search = String(filterValue).toLowerCase().trim();
  if (!search) {
    return true;
  }
  const { id, name, description } = row.original;
  return (
    id.toLowerCase().includes(search) ||
    name.toLowerCase().includes(search) ||
    (description?.toLowerCase().includes(search) ?? false)
  );
};

function IdCell({ getValue }: CellContext<Row, unknown>) {
  const id = getValue<string>();

  return (
    <Tooltip title={id} placement="bottom-start">
      <Typography
        variant="body2"
        sx={{
          fontFamily: "monospace",
          maxWidth: "120px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {id}
      </Typography>
    </Tooltip>
  );
}

function DescriptionCell({ getValue }: CellContext<Row, unknown>) {
  const description = getValue<string | undefined>();

  if (!description) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }

  return (
    <Tooltip title={description} placement="bottom-start">
      <Typography
        variant="body2"
        sx={{
          maxWidth: "250px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {description}
      </Typography>
    </Tooltip>
  );
}

function TotalUsersCell({ getValue }: CellContext<Row, unknown>) {
  const totalUsers = getValue<number | undefined>();

  return (
    <Typography variant="body2">
      {(totalUsers ?? 0).toLocaleString()}
    </Typography>
  );
}

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

function StatusCell({ getValue }: CellContext<Row, unknown>) {
  const status = getValue<string | undefined>();

  if (!status) {
    return null;
  }

  return <Typography variant="body2">{status}</Typography>;
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) {
    return "Never";
  }
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
}

function LiveStatusCell({ getValue }: CellContext<Row, unknown>) {
  const realtimeStatus = getValue<SegmentResource["realtimeStatus"]>();

  if (!realtimeStatus) {
    return (
      <Typography variant="body2" color="text.secondary">
        Not observed
      </Typography>
    );
  }

  const latestLiveUpdate =
    realtimeStatus.lastAssignmentAt ?? realtimeStatus.lastEvaluatedAt;
  const tooltipContent = (
    <Stack spacing={1}>
      <Typography variant="body2">Mode: {realtimeStatus.mode}</Typography>
      <Typography variant="body2">
        Last evaluated: {formatTimestamp(realtimeStatus.lastEvaluatedAt)}
      </Typography>
      <Typography variant="body2">
        Last assignment: {formatTimestamp(realtimeStatus.lastAssignmentAt)}
      </Typography>
      <Typography variant="body2">
        Last trigger: {formatTimestamp(realtimeStatus.lastTriggeredAt)}
      </Typography>
      <Typography variant="body2">
        Evaluated: {realtimeStatus.evaluatedCount}
      </Typography>
      <Typography variant="body2">
        Assignments: {realtimeStatus.assignmentCount}
      </Typography>
      <Typography variant="body2">
        Journey triggers: {realtimeStatus.triggeredJourneyCount}
      </Typography>
      <Typography variant="body2">
        Unsupported: {realtimeStatus.unsupportedCount}
      </Typography>
    </Stack>
  );

  return (
    <Tooltip title={tooltipContent} placement="bottom-start" arrow>
      <Stack spacing={0.25}>
        <Typography variant="body2" sx={{ textTransform: "capitalize" }}>
          {realtimeStatus.mode}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {latestLiveUpdate
            ? `Live ${formatTimestamp(latestLiveUpdate)}`
            : "No live updates"}
        </Typography>
      </Stack>
    </Tooltip>
  );
}

// Cell renderer for Actions column
function ActionsCell({ row, table }: CellContext<Row, unknown>) {
  const theme = useTheme();
  const rowId = row.original.id;
  const rowName = row.original.name;
  const rowStatus = row.original.status;

  // Access functions from table meta
  const deleteSegment = table.options.meta?.deleteSegment;
  const duplicateSegment = table.options.meta?.duplicateSegment;
  const recomputeSegment = table.options.meta?.recomputeSegment;
  const toggleSegmentStatus = table.options.meta?.toggleSegmentStatus;

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleDuplicate = () => {
    if (!duplicateSegment) {
      console.error("duplicateSegment function not found in table meta");
      return;
    }
    duplicateSegment(rowName);
    handleClose();
  };

  const handleRecompute = () => {
    if (!recomputeSegment) {
      return;
    }
    recomputeSegment(rowId);
    handleClose();
  };

  const handleToggleStatus = () => {
    if (!toggleSegmentStatus) {
      return;
    }
    const newStatus =
      rowStatus === SegmentStatusEnum.Running
        ? SegmentStatusEnum.Paused
        : SegmentStatusEnum.Running;
    toggleSegmentStatus(rowId, newStatus);
    handleClose();
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
        <MenuItem onClick={handleToggleStatus}>
          {rowStatus === SegmentStatusEnum.Running ? (
            <>
              <PauseIcon fontSize="small" sx={{ mr: 1 }} />
              Pause
            </>
          ) : (
            <>
              <PlayArrowIcon fontSize="small" sx={{ mr: 1 }} />
              Resume
            </>
          )}
        </MenuItem>
        <MenuItem onClick={handleDuplicate}>
          <ContentCopyIcon fontSize="small" sx={{ mr: 1 }} />
          Duplicate
        </MenuItem>
        <MenuItem
          onClick={handleRecompute}
          disabled={rowStatus !== SegmentStatusEnum.Running}
        >
          <ReplayIcon fontSize="small" sx={{ mr: 1 }} />
          Run batch recompute
        </MenuItem>
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
  const universalRouter = useUniversalRouter();
  const href = universalRouter.mapUrl(`/segments/${segmentId}`, undefined, {
    excludeQueryParams: true,
  });

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

export function SegmentsTable({
  sx,
  columnAllowList = DEFAULT_ALLOWED_SEGMENTS_COLUMNS,
}: {
  sx?: SxProps<Theme>;
  columnAllowList?: SegmentsAllowedColumn[];
}) {
  const universalRouter = useUniversalRouter();
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["apiBase", "workspace"]);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [segmentName, setSegmentName] = useState("");
  const [segmentDescription, setSegmentDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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

  const segmentsQuery = useSegmentsQuery(
    {
      resourceType: "Declarative",
    },
    {
      refetchInterval: 5 * 1000,
    },
  );

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
    return segmentsQuery.data.segments.map((segment) => {
      const period = periodBySegmentId.get(segment.id);
      return {
        ...segment,
        lastRecomputedAt: period
          ? new Date(period.lastRecomputed).getTime()
          : undefined,
        journeysUsedBy: journeysBySegmentId.get(segment.id) ?? [],
      };
    });
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

  const duplicateSegmentMutation = useDuplicateResourceMutation({
    onSuccess: (data) => {
      setSnackbarMessage(`Segment duplicated as "${data.name}"!`);
      setSnackbarOpen(true);
    },
    onError: (error) => {
      console.error("Failed to duplicate segment:", error);
      const errorMsg =
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        (error as AxiosError<{ message?: string }>).response?.data.message ??
        "API Error";
      setSnackbarMessage(`Failed to duplicate segment: ${errorMsg}`);
      setSnackbarOpen(true);
    },
  });

  const statusMutation = useSegmentStatusMutation();
  const recomputeSegmentMutation = useRecomputeSegmentMutation();

  const handleToggleSegmentStatus = (
    segmentId: string,
    newStatus: "NotStarted" | "Running" | "Paused",
  ) => {
    statusMutation.mutate(
      { id: segmentId, status: newStatus },
      {
        onSuccess: () => {
          setSnackbarMessage("Segment status updated successfully!");
          setSnackbarOpen(true);
        },
        onError: () => {
          setSnackbarMessage("Failed to update segment status.");
          setSnackbarOpen(true);
        },
      },
    );
  };

  const createSegmentMutation = useUpdateSegmentsMutation({
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [SEGMENTS_QUERY_KEY] });
      setSnackbarMessage("Segment created successfully!");
      setSnackbarOpen(true);
      setDialogOpen(false);
      setSegmentName("");
      setSegmentDescription("");
      universalRouter.push(`/segments/${data.id}`);
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
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
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
        description: segmentDescription.trim() || undefined,
        definition,
      });
    }
  };

  // Handle dialog close with reset
  const closeDialog = () => {
    setDialogOpen(false);
    setSegmentName("");
    setSegmentDescription("");
  };

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const columnDefinitions: Record<SegmentsAllowedColumn, ColumnDef<Row>> = {
      id: {
        id: "id",
        header: "ID",
        accessorKey: "id",
        cell: IdCell,
      },
      name: {
        id: "name",
        header: "Name",
        accessorKey: "name",
        cell: NameCell,
      },
      description: {
        id: "description",
        header: "Description",
        accessorKey: "description",
        cell: DescriptionCell,
        enableSorting: false,
      },
      totalUsers: {
        id: "totalUsers",
        header: "Total Users",
        accessorKey: "totalUsers",
        cell: TotalUsersCell,
      },
      status: {
        id: "status",
        header: "Status",
        accessorKey: "status",
        cell: StatusCell,
      },
      journeysUsedBy: {
        id: "journeysUsedBy",
        header: "Journeys Used By",
        accessorKey: "journeysUsedBy",
        cell: JourneysCell,
        enableSorting: false,
      },
      lastRecomputed: {
        id: "lastRecomputed",
        header: "Batch Recomputed",
        accessorKey: "lastRecomputedAt",
        cell: TimeCell,
      },
      liveStatus: {
        id: "liveStatus",
        header: "Live Updates",
        accessorKey: "realtimeStatus",
        cell: LiveStatusCell,
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
    data: segmentsData,
    autoResetPageIndex: false,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: segmentSearchFilter,
    onGlobalFilterChange: setSearchQuery,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: {
      globalFilter: searchQuery,
      pagination,
      sorting,
    },
    // Pass functions via meta
    meta: {
      deleteSegment: (segmentId: string) => {
        if (deleteSegmentMutation.isPending) return;
        // Optional: Add confirmation dialog here
        deleteSegmentMutation.mutate(segmentId);
      },
      duplicateSegment: (originalSegmentName: string) => {
        if (duplicateSegmentMutation.isPending) return;
        duplicateSegmentMutation.mutate({
          name: originalSegmentName,
          resourceType: DuplicateResourceTypeEnum.Segment,
        });
      },
      recomputeSegment: (segmentId: string) => {
        if (recomputeSegmentMutation.isPending) return;
        recomputeSegmentMutation.mutate(
          { id: segmentId },
          {
            onSuccess: () => {
              setSnackbarMessage("Segment recompute queued.");
              setSnackbarOpen(true);
            },
            onError: () => {
              setSnackbarMessage("Failed to enqueue segment recompute.");
              setSnackbarOpen(true);
            },
          },
        );
      },
      toggleSegmentStatus: (
        segmentId: string,
        newStatus: "NotStarted" | "Running" | "Paused",
      ) => {
        handleToggleSegmentStatus(segmentId, newStatus);
      },
    },
  });

  const isFetching = segmentsQuery.isFetching || segmentsQuery.isLoading;

  return (
    <>
      <Stack spacing={2} sx={{ width: "100%", height: "100%", ...sx }}>
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
        <TextField
          id="segment-search"
          type="search"
          label="Search by name, ID, or description"
          placeholder="Search segments..."
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            table.setPageIndex(0);
          }}
          fullWidth
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
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
                                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
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
              {!isFetching && table.getRowModel().rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} align="center">
                    {segmentsData.length === 0 ? (
                      <>
                        No segments found.{" "}
                        <Button
                          size="small"
                          onClick={() => setDialogOpen(true)}
                          sx={greyButtonStyle}
                        >
                          Create One
                        </Button>
                      </>
                    ) : (
                      "No segments match your search."
                    )}
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
          <Stack spacing={2} sx={{ mt: 1 }}>
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
            <TextField
              margin="dense"
              id="description"
              label="Description (optional)"
              type="text"
              fullWidth
              variant="standard"
              value={segmentDescription}
              onChange={(e) => setSegmentDescription(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleCreateSegment();
                }
              }}
            />
          </Stack>
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
    </>
  );
}

// Add type definition for table meta
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData = unknown> {
    deleteSegment?: (segmentId: string) => void;
    duplicateSegment?: (segmentName: string) => void;
    recomputeSegment?: (segmentId: string) => void;
    toggleSegmentStatus?: (
      segmentId: string,
      newStatus: "NotStarted" | "Running" | "Paused",
    ) => void;
  }
}
