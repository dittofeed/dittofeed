import {
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import { CatalogSyncRunResource } from "isomorphic-lib/src/catalog";
import React from "react";

import { useCatalogSyncRunsQuery } from "../../lib/useCatalogSyncRunsQuery";

function statusColor(
  status: CatalogSyncRunResource["status"],
): "success.main" | "warning.main" | "error.main" | "text.secondary" {
  switch (status) {
    case "ok":
      return "success.main";
    case "partial":
      return "warning.main";
    case "failed":
      return "error.main";
    case "running":
      return "text.secondary";
  }
}

export default function CatalogSyncRunsTable({
  catalogName,
}: {
  catalogName: string;
}) {
  const runsQuery = useCatalogSyncRunsQuery({ catalogName, limit: 25 });
  const runs = runsQuery.data?.runs ?? [];

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Every pull and every API write records a run. A failed pull leaves the
        previous items in place, so a feed outage degrades to stale data rather
        than an empty product block.
      </Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Started</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Upserted</TableCell>
              <TableCell align="right">Removed</TableCell>
              <TableCell align="right">Skipped</TableCell>
              <TableCell>Error</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell>
                  <Tooltip title={new Date(run.startedAt).toLocaleString()}>
                    <Typography variant="body2">
                      {formatDistanceToNow(new Date(run.startedAt), {
                        addSuffix: true,
                      })}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{run.kind}</Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{ color: statusColor(run.status) }}
                  >
                    {run.status}
                  </Typography>
                </TableCell>
                <TableCell align="right">{run.upsertedCount}</TableCell>
                <TableCell align="right">{run.deletedCount}</TableCell>
                <TableCell align="right">{run.skippedCount}</TableCell>
                <TableCell>
                  {run.error ? (
                    <Tooltip title={run.error}>
                      <Typography
                        variant="caption"
                        color="error.main"
                        sx={{
                          display: "block",
                          maxWidth: 320,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {run.error}
                      </Typography>
                    </Tooltip>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No sync runs yet.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
