import { OpenInNew } from "@mui/icons-material";
import {
  Box,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import Stack from "@mui/material/Stack";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  Row,
  useReactTable,
} from "@tanstack/react-table";
import { MinimalJourneysResource } from "isomorphic-lib/src/types";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useMemo } from "react";

import { useUniversalRouter } from "../../../lib/authModeProvider";
import { useResourcesQuery } from "../../../lib/useResourcesQuery";
import { useSegmentQuery } from "../../../lib/useSegmentQuery";
import getSegmentServerSideProps from "./getSegmentServerSideProps";
import SegmentLayout from "./segmentLayout";

export const getServerSideProps = getSegmentServerSideProps;

function useSegmentJourneys(segmentId: string): MinimalJourneysResource[] {
  const { data: resources } = useResourcesQuery({
    journeys: {
      segments: true,
    },
  });

  return (resources?.journeys ?? []).filter((e) =>
    (e.segments ?? []).includes(segmentId),
  );
}

function JourneyIdCell({ getValue }: { getValue: () => unknown }) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const journeyId = getValue() as string;
  const universalRouter = useUniversalRouter();
  const href = universalRouter.mapUrl(`/journeys/v2`, { id: journeyId });

  return (
    <Stack spacing={2} direction="row" alignItems="center">
      <Typography>{journeyId}</Typography>
      <Tooltip title="View Journey">
        <IconButton size="small" component={Link} href={href}>
          <OpenInNew fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

export default function SegmentJourneys() {
  const theme = useTheme();
  const router = useRouter();
  const segmentId =
    typeof router.query.id === "string" ? router.query.id : null;

  const { data: segment } = useSegmentQuery(segmentId ?? undefined);
  const journeys = useSegmentJourneys(segmentId ?? "");

  const columns = useMemo<ColumnDef<MinimalJourneysResource>[]>(() => {
    return [
      {
        id: "id",
        header: "ID",
        accessorKey: "id",
        // eslint-disable-next-line react/no-unstable-nested-components
        cell: (info) => <JourneyIdCell {...info} />,
      },
      {
        id: "name",
        header: "Name",
        accessorKey: "name",
      },
    ];
  }, []);

  const table = useReactTable({
    columns,
    data: journeys,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  if (!segmentId) {
    return null;
  }

  return (
    <SegmentLayout segmentId={segmentId} tab="journeys">
      <Stack
        spacing={2}
        sx={{
          width: "100%",
          height: "100%",
          padding: 3,
          backgroundColor: theme.palette.grey[100],
        }}
      >
        {segment ? (
          <>
            <Typography variant="h4">
              Journeys using &quot;{segment.name}&quot;
            </Typography>
            {journeys.length === 0 ? (
              <Typography variant="body1" color="text.secondary">
                No journeys use this segment.
              </Typography>
            ) : (
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
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        ) : null}
      </Stack>
    </SegmentLayout>
  );
}
