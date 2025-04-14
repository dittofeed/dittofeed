import {
  Computer,
  Home,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  MoreVert as MoreVertIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  ButtonProps,
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
  useReactTable,
} from "@tanstack/react-table";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import { eq } from "drizzle-orm";
import { GetServerSideProps } from "next";
import React, { useMemo } from "react";

import DashboardContent from "../components/dashboardContent";
// import { BroadcastResourceV2 } from "isomorphic-lib/src/types"; // Removed unused import
import { greyButtonStyle } from "../components/usersTableV2"; // Assuming greyButtonStyle is exported
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { requestContext } from "../lib/requestContext";
import { AppState, PropsWithInitialState } from "../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const { workspace } = dfContext;

    const appState: Partial<AppState> = {};
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const broadcasts = await db().query.broadcast.findMany({
      where: eq(schema.broadcast.workspaceId, workspace.id),
      orderBy: (broadcast, { desc }) => [desc(broadcast.createdAt)],
      // TODO: Filter for V2 broadcasts when the schema differentiates them
    });

    // TODO: Replace with actual BroadcastResourceV2 mapping when available
    // For now, filter out V1 broadcasts if possible or handle potential type mismatch
    // appState.broadcasts = broadcasts
    //   .map((b) => (b.version === "V2" ? toBroadcastResource(b) : null)) // Adjust based on actual schema
    //   .filter((b): b is BroadcastResourceV2 => b !== null);
    appState.broadcasts = []; // Use empty array for now

    return {
      props: addInitialStateToProps({
        props: {},
        serverInitialState: appState,
        dfContext,
      }),
    };
  });

// TODO: Define Row type based on BroadcastResourceV2
interface Row {
  id: string;
  name: string;
  status: string; // Assuming status is a string for now
  createdAt: number;
  scheduledAt?: string;
  // Add other relevant fields from BroadcastResourceV2 as needed
}

// Cell renderer for Actions column
function ActionsCell({ row }: CellContext<Row, unknown>) {
  const theme = useTheme();
  const rowId = row.original.id;
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
  // TODO: Load actual broadcast data using useQuery or similar
  const broadcastsData: Row[] = useMemo(() => [], []); // Empty data for now

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
    manualPagination: true, // Set to true as we'll handle pagination externally
    getCoreRowModel: getCoreRowModel(),
    // TODO: Add state management for pagination if needed later
  });

  // TODO: Implement pagination handlers
  const onNextPage = () => console.log("Next Page Clicked");
  const onPreviousPage = () => console.log("Previous Page Clicked");
  const onFirstPage = () => console.log("First Page Clicked");

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
              {/* TODO: Handle empty state */}
              {broadcastsData.length === 0 && (
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
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <GreyButton
                        onClick={onFirstPage}
                        disabled // Disabled for now
                        startIcon={<KeyboardDoubleArrowLeft />}
                      >
                        First
                      </GreyButton>
                      <GreyButton
                        onClick={onPreviousPage}
                        disabled // Disabled for now
                        startIcon={<KeyboardArrowLeft />}
                      >
                        Previous
                      </GreyButton>
                      <GreyButton
                        onClick={onNextPage}
                        disabled // Disabled for now
                        endIcon={<KeyboardArrowRight />}
                      >
                        Next
                      </GreyButton>
                    </Stack>
                    {/* TODO: Add total count display when data loading is implemented */}
                    {/* <Typography variant="body2" color="text.secondary">
                      Total broadcasts: {totalCount}
                    </Typography> */}
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
