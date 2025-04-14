import {
  Computer,
  Home,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  KeyboardDoubleArrowRight,
  MoreVert as MoreVertIcon,
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
  useTheme,
} from "@mui/material";
import {
  CellContext,
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import {
  BroadcastResource,
  BroadcastResourceV2,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import React, { useMemo, useState } from "react";

import DashboardContent from "../components/dashboardContent";
import { greyButtonStyle } from "../components/usersTableV2"; // Assuming greyButtonStyle is exported
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";
import { useBroadcastsQuery } from "../lib/useBroadcastsQuery";

// Remove specific props, data will be loaded by the hook
type BroadcastsProps = PropsWithInitialState;

export const getServerSideProps: GetServerSideProps<BroadcastsProps> =
  requestContext(async (_ctx, dfContext) => {
    return {
      props: addInitialStateToProps({
        // Minimal props, no initial server state needed for broadcasts
        props: {},
        dfContext,
      }),
    };
  });

// Use BroadcastResourceV2 directly as the Row type
type Row = BroadcastResourceV2;

// Cell renderer for Actions column
function ActionsCell({ row }: CellContext<Row, unknown>) {
  const theme = useTheme();
  const rowId = row.id;
  // TODO: Implement actions menu (e.g., View, Edit, Delete)
  // rowId is currently unused but kept for future implementation
  console.log("Rendering actions for row:", rowId);
  return (
    <Tooltip title="Actions">
      <IconButton
        size="small"
        sx={{
          color: theme.palette.grey[700],
          "&:hover": {
            bgcolor: theme.palette.grey[200],
          },
        }}
        // onClick={(e) => handleMenuOpen(e, rowId)} // Implement menu handler
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

// Cell renderer for Name column
function NameCell({ getValue }: CellContext<Row, unknown>) {
  const value = getValue<string>();
  return <Typography variant="body2">{value}</Typography>;
}

// Cell renderer for Status column
function StatusCell({ getValue }: CellContext<Row, unknown>) {
  // TODO: Add styling/chip based on status value
  const value = getValue<string>();
  return <Typography variant="body2">{value}</Typography>;
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
function ScheduledAtCell({ getValue }: CellContext<Row, unknown>) {
  const value = getValue<string | undefined>();

  if (!value) {
    return null;
  }

  // Simple display of the naive string, maybe format slightly if needed
  // Example: Remove seconds if present 'YYYY-MM-DD HH:MM:SS' -> 'YYYY-MM-DD HH:MM'
  const formattedValue = value.substring(0, 16);

  return (
    <Tooltip
      title={`Scheduled (naive time): ${value}`}
      placement="bottom-start"
      arrow
    >
      <Typography variant="body2">{formattedValue}</Typography>
    </Tooltip>
  );
}

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

export default function Broadcasts() {
  const theme = useTheme();

  const query = useBroadcastsQuery();

  // query.data is potentially (BroadcastResource | BroadcastResourceV2)[]
  const rawData: (BroadcastResource | BroadcastResourceV2)[] = query.data ?? [];

  // Filter for V2 broadcasts before passing to the table
  const broadcastsData: BroadcastResourceV2[] = useMemo(() => {
    return rawData.filter((b): b is BroadcastResourceV2 => "config" in b);
  }, [rawData]);

  const [pagination, setPagination] = useState({
    pageIndex: 0, // initial page index
    pageSize: 10, // default page size
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
        id: "scheduledAt",
        header: "Scheduled At",
        accessorKey: "scheduledAt",
        cell: ScheduledAtCell,
      },
      {
        id: "actions",
        header: "",
        size: 70, // Adjust size as needed
        cell: ActionsCell,
      },
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: broadcastsData,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    state: {
      pagination,
    },
  });

  return (
    <DashboardContent>
      <Stack spacing={2} sx={{ padding: theme.spacing(3), width: "100%" }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h4">Broadcasts</Typography>
          {/* TODO: Add "New Broadcast" button with link */}
          {/* <Button
            variant="contained"
            component={Link}
            href="/broadcasts/v2/recipients/new" // Adjust href as needed
          >
            New Broadcast
          </Button> */}
        </Stack>
        <TableContainer component={Paper}>
          {/* Always render table structure */}
          {query.isError && (
            <Typography color="error" sx={{ padding: 2 }}>
              Failed to load broadcasts.
            </Typography>
          )}
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
                    >
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
    </DashboardContent>
  );
}
