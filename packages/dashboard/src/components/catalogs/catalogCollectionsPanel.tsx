import { Add as AddIcon } from "@mui/icons-material";
import {
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import {
  CatalogCollectionDefinition,
  CatalogCollectionResource,
  CatalogFilter,
} from "isomorphic-lib/src/catalog";
import React, { useMemo, useState } from "react";

import { useCatalogCollectionsQuery } from "../../lib/useCatalogCollectionsQuery";
import { useDeleteCatalogCollectionMutation } from "../../lib/useCatalogMutations";
import ConfirmDeleteDialog from "../confirmDeleteDialog";
import { greyButtonStyle } from "../greyButtonStyle";
import CatalogCollectionEditor from "./catalogCollectionEditor";

function describeFilter(filter?: CatalogFilter): string {
  if (!filter) {
    return "any product";
  }
  if (filter.type === "Field") {
    const value = Array.isArray(filter.value)
      ? filter.value.join(", ")
      : filter.value;
    return `${filter.field} ${filter.operator.toLowerCase()}${
      value === undefined ? "" : ` ${String(value)}`
    }`;
  }
  const joiner = filter.type === "And" ? " and " : " or ";
  return filter.children.map(describeFilter).join(joiner);
}

function describeDefinition(definition: CatalogCollectionDefinition): string {
  const parts = [describeFilter(definition.filter)];
  const sort = definition.sort?.[0];
  if (sort) {
    parts.push(`sorted by ${sort.field} ${sort.direction ?? "asc"}`);
  }
  if (definition.limit) {
    parts.push(`top ${definition.limit}`);
  }
  if (definition.includeOutOfStock) {
    parts.push("including out of stock");
  }
  if (definition.includeUnpublished) {
    parts.push("including unpublished");
  }
  return parts.join(", ");
}

export default function CatalogCollectionsPanel({
  catalogName,
}: {
  catalogName: string;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogCollectionResource | undefined>(
    undefined,
  );

  const collectionsQuery = useCatalogCollectionsQuery();

  const deleteCollection = useDeleteCatalogCollectionMutation();

  const collections = useMemo(
    () =>
      (collectionsQuery.data?.collections ?? []).filter(
        (collection) => collection.catalogName === catalogName,
      ),
    [collectionsQuery.data?.collections, catalogName],
  );

  const openCreate = () => {
    setEditing(undefined);
    setEditorOpen(true);
  };

  const openEdit = (collection: CatalogCollectionResource) => {
    setEditing(collection);
    setEditorOpen(true);
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" color="text.secondary">
          A collection is a saved product query. Templates render it with{" "}
          {`{% catalog_collection "Name" as items %}`}.
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreate}
          sx={greyButtonStyle}
        >
          New Collection
        </Button>
      </Stack>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Definition</TableCell>
              <TableCell>Updated</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {collections.map((collection) => (
              <TableRow
                key={collection.id}
                hover
                sx={{ cursor: "pointer" }}
                onClick={() => openEdit(collection)}
              >
                <TableCell>
                  <Typography variant="body2">{collection.name}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {describeDefinition(collection.definition)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {formatDistanceToNow(new Date(collection.updatedAt), {
                      addSuffix: true,
                    })}
                  </Typography>
                </TableCell>
                <TableCell
                  align="right"
                  // The row opens the editor; deleting should not also open it.
                  onClick={(e) => e.stopPropagation()}
                >
                  <ConfirmDeleteDialog
                    onConfirm={() => deleteCollection.mutate(collection.name)}
                    title={`Delete ${collection.name}?`}
                    message="Templates that render this collection will produce an empty product block until they reference another collection."
                    aria-label={`delete ${collection.name}`}
                    disabled={deleteCollection.isPending}
                  />
                </TableCell>
              </TableRow>
            ))}
            {collections.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No collections in this catalog yet.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <CatalogCollectionEditor
        open={editorOpen}
        catalogName={catalogName}
        initial={editing}
        onClose={() => setEditorOpen(false)}
      />
    </Stack>
  );
}
