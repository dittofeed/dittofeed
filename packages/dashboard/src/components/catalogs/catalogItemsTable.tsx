import {
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
} from "@mui/icons-material";
import {
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  CatalogItemResource,
  CatalogItemStatus,
  CatalogItemType,
} from "isomorphic-lib/src/catalog";
import React, { useState } from "react";

import { useCatalogItemsQuery } from "../../lib/useCatalogItemsQuery";
import { GreyButton } from "../greyButtonStyle";

const PAGE_SIZE = 50;

function parseItemType(value: unknown): CatalogItemType | "" {
  switch (value) {
    case CatalogItemType.Product:
      return CatalogItemType.Product;
    case CatalogItemType.Variant:
      return CatalogItemType.Variant;
    default:
      return "";
  }
}

function parseItemStatus(value: unknown): CatalogItemStatus | "" {
  switch (value) {
    case CatalogItemStatus.Published:
      return CatalogItemStatus.Published;
    case CatalogItemStatus.Draft:
      return CatalogItemStatus.Draft;
    case CatalogItemStatus.Archived:
      return CatalogItemStatus.Archived;
    default:
      return "";
  }
}

function formatMoney(item: CatalogItemResource): string {
  if (item.price === undefined) {
    return "—";
  }
  const currency = item.currency ?? "USD";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).format(item.price);
  } catch {
    // An unrecognized currency code should not break the table.
    return `${item.price} ${currency}`;
  }
}

function InventoryCell({ item }: { item: CatalogItemResource }) {
  const quantity =
    item.itemType === CatalogItemType.Product
      ? item.inventoryTotal
      : item.inventoryQuantity;

  return (
    <Stack spacing={0.25}>
      <Typography variant="body2">
        {quantity === undefined ? "—" : quantity}
      </Typography>
      {item.inStock ? null : (
        <Typography variant="caption" color="error.main">
          Out of stock
        </Typography>
      )}
    </Stack>
  );
}

export default function CatalogItemsTable({
  catalogName,
}: {
  catalogName: string;
}) {
  const [itemType, setItemType] = useState<CatalogItemType | "">("");
  const [status, setStatus] = useState<CatalogItemStatus | "">("");
  // Cursors are a stack so "previous" can go back without re-querying from the
  // start of a large catalog.
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const cursor = cursorStack[cursorStack.length - 1];

  const itemsQuery = useCatalogItemsQuery({
    catalogName,
    limit: PAGE_SIZE,
    cursor,
    itemType: itemType === "" ? undefined : itemType,
    status: status === "" ? undefined : status,
  });

  const items = itemsQuery.data?.items ?? [];
  const total = itemsQuery.data?.itemCount;
  const nextCursor = itemsQuery.data?.nextCursor;
  const { isFetching } = itemsQuery;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="catalog-item-type">Type</InputLabel>
          <Select
            labelId="catalog-item-type"
            label="Type"
            value={itemType}
            onChange={(e) => {
              setCursorStack([undefined]);
              setItemType(parseItemType(e.target.value));
            }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value={CatalogItemType.Product}>Products</MenuItem>
            <MenuItem value={CatalogItemType.Variant}>Variants</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="catalog-item-status">Status</InputLabel>
          <Select
            labelId="catalog-item-status"
            label="Status"
            value={status}
            onChange={(e) => {
              setCursorStack([undefined]);
              setStatus(parseItemStatus(e.target.value));
            }}
          >
            <MenuItem value="">Live</MenuItem>
            <MenuItem value={CatalogItemStatus.Published}>Published</MenuItem>
            <MenuItem value={CatalogItemStatus.Draft}>Draft</MenuItem>
            <MenuItem value={CatalogItemStatus.Archived}>
              Archived (removed from the feed)
            </MenuItem>
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary">
          {total === undefined ? "" : `${total} matching items`}
        </Typography>
      </Stack>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Item ID</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Price</TableCell>
              <TableCell>Inventory</TableCell>
              <TableCell>Categories</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={`${item.itemId}-${item.itemType}`} hover>
                <TableCell>
                  <Stack spacing={0.25}>
                    <Typography variant="body2">{item.itemId}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.itemType === CatalogItemType.Variant
                        ? `variant of ${item.parentItemId ?? "?"}`
                        : "product"}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{item.title ?? "—"}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{formatMoney(item)}</Typography>
                  {item.compareAtPrice ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ textDecoration: "line-through" }}
                    >
                      {item.compareAtPrice}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell>
                  <InventoryCell item={item} />
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {item.categories.join(", ") || "—"}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption">{item.status}</Typography>
                </TableCell>
              </TableRow>
            ))}
            {!isFetching && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No items. Sync the feed, or write items through the API.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack direction="row" spacing={2} alignItems="center">
        <GreyButton
          size="small"
          startIcon={<ArrowBackIcon />}
          disabled={cursorStack.length <= 1 || isFetching}
          onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
        >
          Previous
        </GreyButton>
        <GreyButton
          size="small"
          endIcon={<ArrowForwardIcon />}
          disabled={!nextCursor || isFetching}
          onClick={() =>
            setCursorStack((stack) =>
              nextCursor ? [...stack, nextCursor] : stack,
            )
          }
        >
          Next
        </GreyButton>
        {isFetching ? <CircularProgress size={16} /> : null}
      </Stack>
    </Stack>
  );
}
