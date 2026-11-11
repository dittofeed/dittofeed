import { Chip, Stack, Tooltip, Typography } from "@mui/material";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import { CatalogResource, CatalogSyncStatus } from "isomorphic-lib/src/catalog";

/**
 * Renders how current a catalog's data is. A product block rendered against a
 * stale catalog is not obviously wrong to the recipient, so the staleness has to
 * be visible to whoever is authoring the send.
 */
export function CatalogSyncStatusChip({
  status,
}: {
  status: CatalogSyncStatus;
}) {
  switch (status) {
    case CatalogSyncStatus.Ok:
      return <Chip size="small" label="Synced" color="success" />;
    case CatalogSyncStatus.Partial:
      return (
        <Tooltip title="Some items in the last sync were skipped. Check the sync runs tab.">
          <Chip size="small" label="Partial" color="warning" />
        </Tooltip>
      );
    case CatalogSyncStatus.Failed:
      return (
        <Tooltip title="The last sync failed. The catalog still serves its previous data.">
          <Chip size="small" label="Failed" color="error" />
        </Tooltip>
      );
    case CatalogSyncStatus.Never:
      return (
        <Tooltip title="No sync has completed yet.">
          <Chip size="small" label="Never synced" variant="outlined" />
        </Tooltip>
      );
  }
}

export function CatalogFreshness({
  catalog,
}: {
  catalog: Pick<CatalogResource, "lastSyncedAt" | "syncStatus">;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2" color="text.secondary">
        {catalog.lastSyncedAt
          ? `Synced ${formatDistanceToNow(new Date(catalog.lastSyncedAt), {
              addSuffix: true,
            })}`
          : "Never synced"}
      </Typography>
      <CatalogSyncStatusChip status={catalog.syncStatus} />
    </Stack>
  );
}
