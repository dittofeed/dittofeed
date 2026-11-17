import {
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { CatalogSourceType } from "isomorphic-lib/src/catalog";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState } from "react";

import CatalogCollectionsPanel from "../../components/catalogs/catalogCollectionsPanel";
import { CatalogFreshness } from "../../components/catalogs/catalogFreshness";
import CatalogItemsTable from "../../components/catalogs/catalogItemsTable";
import CatalogSyncRunsTable from "../../components/catalogs/catalogSyncRunsTable";
import DashboardContent from "../../components/dashboardContent";
import { greyButtonStyle } from "../../components/greyButtonStyle";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { requestContext } from "../../lib/requestContext";
import { useSyncCatalogMutation } from "../../lib/useCatalogMutations";
import { useCatalogQuery } from "../../lib/useCatalogQuery";

export const getServerSideProps: GetServerSideProps = requestContext(
  async (_ctx, dfContext) => {
    return {
      props: addInitialStateToProps({
        props: {},
        dfContext,
      }),
    };
  },
);

function CatalogDetailContents() {
  const router = useRouter();
  const rawName = router.query.name;
  const name = Array.isArray(rawName) ? rawName[0] : rawName;

  const [tab, setTab] = useState(0);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const catalogQuery = useCatalogQuery(name);
  const catalog = catalogQuery.data?.catalog;

  const syncCatalog = useSyncCatalogMutation({
    onSuccess: (result) => {
      setSnackbarMessage(
        result.status === "failed"
          ? `Sync failed: ${result.error ?? "unknown error"}. The previous items are still served.`
          : `Synced ${result.upsertedCount} items, removed ${result.archivedCount}${
              result.skippedCount ? `, skipped ${result.skippedCount}` : ""
            }.`,
      );
      setSnackbarOpen(true);
    },
    onError: (error) => {
      setSnackbarMessage(
        `Sync failed: ${error.response?.data.message ?? error.message}`,
      );
      setSnackbarOpen(true);
    },
  });

  if (!name) {
    return null;
  }

  if (catalogQuery.isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", padding: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (catalogQuery.isError || !catalog) {
    return (
      <Stack spacing={2} sx={{ padding: 3 }}>
        <Typography variant="h5">Catalog not found</Typography>
        <Typography variant="body2" color="text.secondary">
          {catalogQuery.error?.message ?? "This catalog no longer exists."}
        </Typography>
        <Box>
          <Link href="/catalogs">Back to catalogs</Link>
        </Box>
      </Stack>
    );
  }

  const isFeed = catalog.sourceType === CatalogSourceType.Feed;

  return (
    <Stack spacing={2} sx={{ padding: 3, width: "100%" }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          component={Link}
          href="/catalogs"
          size="small"
          startIcon={<ArrowBackIcon />}
        >
          Catalogs
        </Button>
      </Stack>

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
      >
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h4">{catalog.name}</Typography>
            <Chip
              size="small"
              variant="outlined"
              label={isFeed ? "Feed" : "API"}
            />
            <Chip size="small" variant="outlined" label={catalog.currency} />
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center">
            <CatalogFreshness catalog={catalog} />
            <Typography variant="body2" color="text.secondary">
              {catalog.itemCount} products, {catalog.variantCount} variants
            </Typography>
            {isFeed ? (
              <Typography variant="body2" color="text.secondary">
                Refreshing every {catalog.syncIntervalMinutes / 60}h
              </Typography>
            ) : null}
          </Stack>
          {catalog.sourceUrl ? (
            <Typography variant="caption" color="text.secondary">
              {catalog.sourceUrl}
            </Typography>
          ) : null}
          {catalog.consecutiveFailures > 0 ? (
            <Typography variant="body2" color="error.main">
              {catalog.consecutiveFailures} consecutive failed{" "}
              {catalog.consecutiveFailures === 1 ? "pull" : "pulls"}. Retries
              back off up to a day.
            </Typography>
          ) : null}
        </Stack>

        {isFeed ? (
          <Button
            variant="contained"
            startIcon={
              syncCatalog.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <RefreshIcon />
              )
            }
            sx={greyButtonStyle}
            disabled={syncCatalog.isPending}
            onClick={() => syncCatalog.mutate(catalog.name)}
          >
            Sync now
          </Button>
        ) : null}
      </Stack>

      <Divider />

      <Tabs value={tab} onChange={(_event, value: number) => setTab(value)}>
        <Tab label="Products" />
        <Tab label="Collections" />
        <Tab label="Sync runs" />
      </Tabs>

      {tab === 0 ? <CatalogItemsTable catalogName={catalog.name} /> : null}
      {tab === 1 ? (
        <CatalogCollectionsPanel catalogName={catalog.name} />
      ) : null}
      {tab === 2 ? <CatalogSyncRunsTable catalogName={catalog.name} /> : null}

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={8000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Stack>
  );
}

export default function CatalogDetail() {
  return (
    <DashboardContent>
      <CatalogDetailContents />
    </DashboardContent>
  );
}
