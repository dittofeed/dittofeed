import {
  Add as AddIcon,
  OpenInNew as OpenInNewIcon,
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
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { CatalogResource, CatalogSourceType } from "isomorphic-lib/src/catalog";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

import {
  useDeleteCatalogMutation,
  useUpsertCatalogMutation,
} from "../../lib/useCatalogMutations";
import { useCatalogsQuery } from "../../lib/useCatalogsQuery";
import ConfirmDeleteDialog from "../confirmDeleteDialog";
import { greyButtonStyle } from "../greyButtonStyle";
import { CatalogFreshness } from "./catalogFreshness";

function SourceCell({
  catalog,
}: {
  catalog: Pick<CatalogResource, "sourceType" | "sourceUrl">;
}) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2">
        {catalog.sourceType === CatalogSourceType.Feed ? "Feed" : "API"}
      </Typography>
      {catalog.sourceUrl ? (
        <Tooltip title={catalog.sourceUrl}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              maxWidth: 260,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {catalog.sourceUrl}
          </Typography>
        </Tooltip>
      ) : null}
    </Stack>
  );
}

export default function CatalogsTable() {
  const router = useRouter();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [isFeed, setIsFeed] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(360);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const catalogsQuery = useCatalogsQuery();

  useEffect(() => {
    if (catalogsQuery.isError) {
      setSnackbarMessage("Failed to load catalogs.");
      setSnackbarOpen(true);
    }
  }, [catalogsQuery.isError]);

  const upsertCatalog = useUpsertCatalogMutation({
    onSuccess: (data) => {
      setDialogOpen(false);
      setName("");
      setSourceUrl("");
      router.push(`/catalogs/${encodeURIComponent(data.catalog.name)}`);
    },
    onError: (error) => {
      setSnackbarMessage(
        `Failed to create catalog: ${error.response?.data.message ?? error.message}`,
      );
      setSnackbarOpen(true);
    },
  });

  const deleteCatalog = useDeleteCatalogMutation({
    onSuccess: () => {
      setSnackbarMessage("Catalog deleted.");
      setSnackbarOpen(true);
    },
    onError: (error) => {
      setSnackbarMessage(
        `Failed to delete catalog: ${error.response?.data.message ?? error.message}`,
      );
      setSnackbarOpen(true);
    },
  });

  const catalogs = catalogsQuery.data?.catalogs ?? [];
  const { isFetching } = catalogsQuery;

  const canSubmit =
    name.trim().length > 0 &&
    (!isFeed || sourceUrl.trim().length > 0) &&
    !upsertCatalog.isPending;

  const handleCreate = () => {
    if (!canSubmit) {
      return;
    }
    upsertCatalog.mutate({
      name: name.trim(),
      sourceType: isFeed ? CatalogSourceType.Feed : CatalogSourceType.Api,
      ...(isFeed
        ? {
            sourceUrl: sourceUrl.trim(),
            syncIntervalMinutes,
          }
        : {}),
    });
  };

  return (
    <Stack spacing={2} sx={{ width: "100%", height: "100%" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack spacing={0.5}>
          <Typography variant="h4">Catalogs</Typography>
          <Typography variant="body2" color="text.secondary">
            Products and variants that messages can render, kept current by a
            feed pull or your own sync task.
          </Typography>
        </Stack>
        <Button
          variant="contained"
          onClick={() => setDialogOpen(true)}
          startIcon={<AddIcon />}
          sx={greyButtonStyle}
        >
          New Catalog
        </Button>
      </Stack>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Source</TableCell>
              <TableCell align="right">Products</TableCell>
              <TableCell align="right">Variants</TableCell>
              <TableCell>Freshness</TableCell>
              <TableCell>Next sync</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {catalogs.map((catalog) => (
              <TableRow key={catalog.id} hover>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Link
                      href={`/catalogs/${encodeURIComponent(catalog.name)}`}
                      style={{ color: "inherit" }}
                    >
                      <Typography variant="body2">{catalog.name}</Typography>
                    </Link>
                    <Tooltip title="Open catalog">
                      <IconButton
                        size="small"
                        component={Link}
                        href={`/catalogs/${encodeURIComponent(catalog.name)}`}
                      >
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
                <TableCell>
                  <SourceCell catalog={catalog} />
                </TableCell>
                <TableCell align="right">{catalog.itemCount}</TableCell>
                <TableCell align="right">{catalog.variantCount}</TableCell>
                <TableCell>
                  <CatalogFreshness catalog={catalog} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {catalog.nextSyncAt
                      ? new Date(catalog.nextSyncAt).toLocaleString()
                      : "—"}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <ConfirmDeleteDialog
                    onConfirm={() => deleteCatalog.mutate(catalog.name)}
                    title={`Delete ${catalog.name}?`}
                    message="Every item, collection, and saved restock subscription in this catalog is deleted. Templates that render its collections start producing empty lists."
                    aria-label={`delete ${catalog.name}`}
                    disabled={deleteCatalog.isPending}
                  />
                </TableCell>
              </TableRow>
            ))}
            {!isFetching && catalogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Stack spacing={1} alignItems="center" sx={{ padding: 4 }}>
                    <Typography color="text.secondary">
                      No catalogs yet.
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => setDialogOpen(true)}
                      sx={greyButtonStyle}
                    >
                      Create One
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      {isFetching ? (
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <CircularProgress size={20} />
        </Box>
      ) : null}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>New Catalog</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              autoFocus
              label="Name"
              fullWidth
              variant="standard"
              value={name}
              onChange={(e) => setName(e.target.value)}
              helperText="Templates reference this catalog's collections by name. Renaming it later means updating those templates."
            />
            <FormControlLabel
              control={
                <Switch
                  checked={isFeed}
                  onChange={(e) => setIsFeed(e.target.checked)}
                />
              }
              label="Pull this catalog from a feed"
            />
            {isFeed ? (
              <>
                <TextField
                  label="Feed URL"
                  fullWidth
                  variant="standard"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  helperText="A JSON or XML product feed. Format is detected from the response."
                />
                <FormControl fullWidth variant="standard">
                  <InputLabel id="catalog-sync-interval">
                    Sync interval
                  </InputLabel>
                  <Select
                    labelId="catalog-sync-interval"
                    value={syncIntervalMinutes}
                    onChange={(e) =>
                      setSyncIntervalMinutes(Number(e.target.value))
                    }
                  >
                    <MenuItem value={60}>Every hour</MenuItem>
                    <MenuItem value={360}>Every 6 hours</MenuItem>
                    <MenuItem value={720}>Every 12 hours</MenuItem>
                    <MenuItem value={1440}>Every day</MenuItem>
                  </Select>
                </FormControl>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Items are written by your own sync task through
                <code> PUT /api/catalogs/items</code>.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!canSubmit}>
            {upsertCatalog.isPending ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={16} />
                <span>Creating...</span>
              </Stack>
            ) : (
              "Create"
            )}
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
    </Stack>
  );
}
