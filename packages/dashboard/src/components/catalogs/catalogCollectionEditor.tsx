import {
  Add as AddIcon,
  PlayArrow as PlayArrowIcon,
} from "@mui/icons-material";
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
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
  Typography,
} from "@mui/material";
import {
  CatalogCollectionDefinition,
  CatalogCollectionResource,
  CatalogFilter,
  CatalogFilterOperatorType,
  CatalogFilterScalar,
  CatalogItemResource,
} from "isomorphic-lib/src/catalog";
import React, { useEffect, useState } from "react";
import { v4 as uuid } from "uuid";

import {
  usePreviewCatalogCollectionMutation,
  useUpsertCatalogCollectionMutation,
} from "../../lib/useCatalogMutations";
import { GreyButton } from "../greyButtonStyle";
import { CatalogSyncStatusChip } from "./catalogFreshness";

/**
 * Field paths the query engine resolves to typed columns. Anything else is read
 * from the item's `attributes` blob, which works but cannot use an index, so the
 * editor suggests these first.
 */
const SUGGESTED_FIELDS = [
  "itemId",
  "title",
  "price",
  "compareAtPrice",
  "priceMin",
  "priceMax",
  "inventoryQuantity",
  "inventoryTotal",
  "inStock",
  "status",
  "brand",
  "categories",
  "tags",
  "url",
];

const OPERATORS: { value: CatalogFilterOperatorType; label: string }[] = [
  { value: CatalogFilterOperatorType.Equals, label: "is" },
  { value: CatalogFilterOperatorType.NotEquals, label: "is not" },
  { value: CatalogFilterOperatorType.Contains, label: "contains" },
  { value: CatalogFilterOperatorType.In, label: "is any of" },
  { value: CatalogFilterOperatorType.NotIn, label: "is none of" },
  { value: CatalogFilterOperatorType.GreaterThan, label: "greater than" },
  {
    value: CatalogFilterOperatorType.GreaterThanOrEqual,
    label: "at least",
  },
  { value: CatalogFilterOperatorType.LessThan, label: "less than" },
  { value: CatalogFilterOperatorType.LessThanOrEqual, label: "at most" },
  { value: CatalogFilterOperatorType.Exists, label: "is set" },
];

function parseMatch(value: unknown): "all" | "any" {
  return value === "any" ? "any" : "all";
}

function parseDirection(value: unknown): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

function parseOperator(value: unknown): CatalogFilterOperatorType {
  const match = OPERATORS.find((operator) => operator.value === value);
  return match ? match.value : CatalogFilterOperatorType.Equals;
}

interface Condition {
  id: string;
  field: string;
  operator: CatalogFilterOperatorType;
  // Kept as raw text so a half-typed number does not become NaN in the request.
  value: string;
}

const OPERATORS_WITHOUT_VALUE = new Set<CatalogFilterOperatorType>([
  CatalogFilterOperatorType.Exists,
]);

const ARRAY_OPERATORS = new Set<CatalogFilterOperatorType>([
  CatalogFilterOperatorType.In,
  CatalogFilterOperatorType.NotIn,
]);

function conditionValue(condition: Condition): string | string[] | undefined {
  if (OPERATORS_WITHOUT_VALUE.has(condition.operator)) {
    return undefined;
  }
  if (ARRAY_OPERATORS.has(condition.operator)) {
    return condition.value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return condition.value;
}

function toFilter(
  conditions: Condition[],
  match: "all" | "any",
): CatalogFilter | undefined {
  const children = conditions
    .filter((condition) => condition.field.trim().length > 0)
    .map((condition) => {
      const value = conditionValue(condition);
      return {
        type: "Field" as const,
        field: condition.field.trim(),
        operator: condition.operator,
        ...(value === undefined ? {} : { value }),
      };
    });

  if (children.length === 0) {
    return undefined;
  }
  if (children.length === 1 && match === "all") {
    return children[0];
  }
  return { type: match === "all" ? "And" : "Or", children };
}

function scalarText(
  value: CatalogFilterScalar | CatalogFilterScalar[] | undefined,
): string {
  if (value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

function conditionsFromFilter(filter?: CatalogFilter): {
  conditions: Condition[];
  match: "all" | "any";
} {
  if (!filter) {
    return { conditions: [], match: "all" };
  }
  if (filter.type === "Field") {
    const raw = filter.value;
    return {
      conditions: [
        {
          id: uuid(),
          field: filter.field,
          operator: filter.operator,
          value: scalarText(raw),
        },
      ],
      match: "all",
    };
  }
  return {
    match: filter.type === "And" ? "all" : "any",
    conditions: filter.children.flatMap((child) => {
      if (child.type !== "Field") {
        return [];
      }
      const raw = child.value;
      return [
        {
          id: uuid(),
          field: child.field,
          operator: child.operator,
          value: scalarText(raw),
        },
      ];
    }),
  };
}

function hasNestedGroups(filter?: CatalogFilter): boolean {
  if (!filter || filter.type === "Field") {
    return false;
  }
  return filter.children.some((child) => child.type !== "Field");
}

function formatPrice(item: CatalogItemResource): string {
  if (item.price === undefined) {
    return "—";
  }
  return `${item.price} ${item.currency ?? ""}`.trim();
}

export default function CatalogCollectionEditor({
  open,
  catalogName,
  initial,
  onClose,
}: {
  open: boolean;
  catalogName: string;
  initial?: CatalogCollectionResource;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [match, setMatch] = useState<"all" | "any">("all");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [nested, setNested] = useState(false);
  const [sortField, setSortField] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState("10");
  const [itemProperties, setItemProperties] = useState("");
  const [includeOutOfStock, setIncludeOutOfStock] = useState(false);
  const [includeUnpublished, setIncludeUnpublished] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const upsertCollection = useUpsertCatalogCollectionMutation({
    onSuccess: () => {
      setSnackbarMessage("Collection saved.");
      setSnackbarOpen(true);
      onClose();
    },
    onError: (error) => {
      setSnackbarMessage(
        `Failed to save collection: ${
          error.response?.data.message ?? error.message
        }`,
      );
      setSnackbarOpen(true);
    },
  });

  const preview = usePreviewCatalogCollectionMutation();

  useEffect(() => {
    if (!open) {
      return;
    }
    const definition = initial?.definition;
    const parsed = conditionsFromFilter(definition?.filter);
    setName(initial?.name ?? "");
    setMatch(parsed.match);
    setConditions(parsed.conditions);
    setNested(hasNestedGroups(definition?.filter));
    setSortField(definition?.sort?.[0]?.field ?? "");
    setSortDirection(definition?.sort?.[0]?.direction ?? "desc");
    setLimit(String(definition?.limit ?? 10));
    setItemProperties((definition?.itemProperties ?? []).join(", "));
    setIncludeOutOfStock(definition?.includeOutOfStock ?? false);
    setIncludeUnpublished(definition?.includeUnpublished ?? false);
    preview.reset();
    // `preview` is a stable mutation object; re-running this when the dialog
    // opens is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const definition = (): CatalogCollectionDefinition => {
    const filter = toFilter(conditions, match);
    const properties = itemProperties
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const parsedLimit = Number(limit);
    return {
      ...(filter ? { filter } : {}),
      ...(sortField.trim()
        ? { sort: [{ field: sortField.trim(), direction: sortDirection }] }
        : {}),
      ...(Number.isFinite(parsedLimit) && parsedLimit > 0
        ? { limit: parsedLimit }
        : {}),
      ...(properties.length ? { itemProperties: properties } : {}),
      ...(includeOutOfStock ? { includeOutOfStock: true } : {}),
      ...(includeUnpublished ? { includeUnpublished: true } : {}),
    };
  };

  const canPreview = conditions.every(
    (condition) =>
      OPERATORS_WITHOUT_VALUE.has(condition.operator) ||
      condition.value.trim().length > 0,
  );

  const canSave = name.trim().length > 0 && canPreview;

  const handlePreview = () => {
    preview.mutate({ catalogName, definition: definition() });
  };

  const handleSave = () => {
    upsertCollection.mutate({
      name: name.trim(),
      catalogName,
      definition: definition(),
    });
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        scroll="paper"
      >
        <DialogTitle>
          {initial ? `Edit ${initial.name}` : "New Collection"}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Collection name"
              fullWidth
              variant="standard"
              value={name}
              onChange={(e) => setName(e.target.value)}
              helperText='Templates read it as {% catalog_collection "Name" as items %}.'
            />

            {nested ? (
              <Alert severity="warning">
                This collection uses nested filter groups. The editor below
                shows them as one flat list, so saving from here simplifies the
                definition.
              </Alert>
            ) : null}

            <Stack spacing={1}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="subtitle2">Products matching</Typography>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <Select
                    value={match}
                    onChange={(e) => setMatch(parseMatch(e.target.value))}
                  >
                    <MenuItem value="all">all conditions</MenuItem>
                    <MenuItem value="any">any condition</MenuItem>
                  </Select>
                </FormControl>
              </Stack>

              {conditions.map((condition, index) => (
                <Stack
                  key={condition.id}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                >
                  <Autocomplete
                    freeSolo
                    options={SUGGESTED_FIELDS}
                    value={condition.field}
                    onInputChange={(_event, value) =>
                      setConditions((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, field: value } : entry,
                        ),
                      )
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Field"
                        size="small"
                        sx={{ minWidth: 180 }}
                      />
                    )}
                  />
                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <Select
                      value={condition.operator}
                      onChange={(e) =>
                        setConditions((current) =>
                          current.map((entry, i) =>
                            i === index
                              ? {
                                  ...entry,
                                  operator: parseOperator(e.target.value),
                                }
                              : entry,
                          ),
                        )
                      }
                    >
                      {OPERATORS.map((operator) => (
                        <MenuItem key={operator.value} value={operator.value}>
                          {operator.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {OPERATORS_WITHOUT_VALUE.has(condition.operator) ? null : (
                    <TextField
                      label={
                        ARRAY_OPERATORS.has(condition.operator)
                          ? "Comma separated"
                          : "Value"
                      }
                      size="small"
                      value={condition.value}
                      onChange={(e) =>
                        setConditions((current) =>
                          current.map((entry, i) =>
                            i === index
                              ? { ...entry, value: e.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  )}
                  <Button
                    size="small"
                    onClick={() =>
                      setConditions((current) =>
                        current.filter((_entry, i) => i !== index),
                      )
                    }
                  >
                    Remove
                  </Button>
                </Stack>
              ))}

              <Stack direction="row">
                <GreyButton
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() =>
                    setConditions((current) => [
                      ...current,
                      {
                        id: uuid(),
                        field: "",
                        operator: CatalogFilterOperatorType.Equals,
                        value: "",
                      },
                    ])
                  }
                >
                  Add condition
                </GreyButton>
              </Stack>
            </Stack>

            <Divider />

            <Stack direction="row" spacing={2}>
              <Autocomplete
                freeSolo
                options={SUGGESTED_FIELDS}
                value={sortField}
                onInputChange={(_event, value) => setSortField(value)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Sort by"
                    size="small"
                    sx={{ minWidth: 200 }}
                  />
                )}
              />
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <Select
                  value={sortDirection}
                  onChange={(e) =>
                    setSortDirection(parseDirection(e.target.value))
                  }
                >
                  <MenuItem value="desc">High to low</MenuItem>
                  <MenuItem value="asc">Low to high</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Limit"
                size="small"
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                sx={{ minWidth: 100 }}
              />
            </Stack>

            <TextField
              label="Fields to return"
              fullWidth
              size="small"
              value={itemProperties}
              onChange={(e) => setItemProperties(e.target.value)}
              helperText="Comma separated. itemId and itemType are always included so templates can link and de-duplicate."
            />

            <Stack direction="row" spacing={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={includeOutOfStock}
                    onChange={(e) => setIncludeOutOfStock(e.target.checked)}
                  />
                }
                label="Include out of stock"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={includeUnpublished}
                    onChange={(e) => setIncludeUnpublished(e.target.checked)}
                  />
                }
                label="Include unpublished"
              />
            </Stack>

            {preview.data || preview.isError ? (
              <Stack spacing={1}>
                <Divider />
                {preview.isError ? (
                  <Alert severity="error">
                    Preview failed:{" "}
                    {preview.error.response?.data.message ??
                      preview.error.message}
                  </Alert>
                ) : null}
                {preview.data ? (
                  <>
                    <Stack
                      direction="row"
                      spacing={2}
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Typography variant="subtitle2">
                        {preview.data.itemCount} matching,{" "}
                        {preview.data.returnedCount} returned
                      </Typography>
                      {preview.data.dataFreshness ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" color="text.secondary">
                            {preview.data.dataFreshness.lastSyncedAt
                              ? `Data from ${new Date(
                                  preview.data.dataFreshness.lastSyncedAt,
                                ).toLocaleString()}`
                              : "No sync yet"}
                          </Typography>
                          <CatalogSyncStatusChip
                            status={preview.data.dataFreshness.syncStatus}
                          />
                        </Stack>
                      ) : null}
                    </Stack>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Item</TableCell>
                            <TableCell>Title</TableCell>
                            <TableCell>Price</TableCell>
                            <TableCell>In stock</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {preview.data.items.map((item) => (
                            <TableRow key={`${item.itemId}-${item.itemType}`}>
                              <TableCell>{item.itemId}</TableCell>
                              <TableCell>{item.title ?? "—"}</TableCell>
                              <TableCell>{formatPrice(item)}</TableCell>
                              <TableCell>
                                {item.inStock ? "Yes" : "No"}
                              </TableCell>
                            </TableRow>
                          ))}
                          {preview.data.items.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} align="center">
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  Nothing matches. A send using this collection
                                  renders an empty product block.
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <GreyButton
            startIcon={<PlayArrowIcon />}
            onClick={handlePreview}
            disabled={!canPreview || preview.isPending}
          >
            Preview
          </GreyButton>
          <Button
            onClick={handleSave}
            disabled={!canSave || upsertCollection.isPending}
          >
            {upsertCollection.isPending ? "Saving..." : "Save"}
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
    </>
  );
}
