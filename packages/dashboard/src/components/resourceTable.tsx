import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SxProps,
  Theme,
  Tooltip,
  useTheme,
} from "@mui/material";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import Link from "next/link";
import React, { useMemo } from "react";

import DeleteDialog from "./confirmDeleteDialog";

export function RelatedResourceSelect({
  label,
  relatedResources,
}: {
  label: string;
  relatedResources: {
    name: string;
    href: string;
  }[];
}) {
  const theme = useTheme();
  return (
    <FormControl
      sx={{
        width: theme.spacing(20),
      }}
      size="small"
    >
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {relatedResources.map(({ href, name }) => {
          return (
            <MenuItem key={href}>
              <Tooltip title={name}>
                <Link
                  href={href}
                  passHref
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  style={{
                    color: "black",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textDecoration: "none",
                    width: 200,
                  }}
                >
                  {name}
                </Link>
              </Tooltip>
            </MenuItem>
          );
        })}
      </Select>
    </FormControl>
  );
}

const RESOURCE_TABLE_STYLE: SxProps<Theme> = {
  height: "100%",
  width: "100%",
  ".MuiDataGrid-row:first-of-type": {
    borderTop: "1px solid lightgray",
  },
  "& .MuiDataGrid-row": {
    borderBottom: "1px solid lightgray",
    pt: 1,
    pb: 1,
  },
  "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": {
    outline: "none",
  },

  // disable cell selection style
  "& .MuiDataGrid-cell": {
    pl: 1,
    pr: 1,
  },
  // pointer cursor on ALL rows
  "& .MuiDataGrid-row:hover": {
    cursor: "pointer",
  },
};

export interface BaseResourceRow {
  id: string;
  name: string;
  updatedAt: string;
  disableDelete?: boolean;
}

const BASE_COLUMN = {
  flex: 1,
  sortable: false,
  filterable: false,
} as const;

export function ResourceTable<R extends BaseResourceRow = BaseResourceRow>({
  rows,
  getHref,
  additionalColumns = [],
  onDelete,
}: {
  rows: R[];
  getHref: (id: string) => string;
  additionalColumns?: GridColDef<R>[];
  onDelete?: ({ row }: { row: R }) => void;
}) {
  const columns: GridColDef<R>[] = useMemo(() => {
    return [
      {
        field: "name",
        headerName: "Name",
        sortable: true, // Enable sorting for the name column
      },
      ...additionalColumns,
      {
        field: "updatedAt",
        headerName: "Updated At",
      },
      ...(onDelete === undefined
        ? []
        : [
            {
              field: "actions",
              headerName: "Action",
              width: 180,
              sortable: false,
              // eslint-disable-next-line react/no-unused-prop-types
              renderCell: ({ row }: { row: R }) => (
                <DeleteDialog
                  disabled={row.disableDelete}
                  onConfirm={() => onDelete({ row })}
                  title={`Delete ${row.name}`}
                  message={`Are you sure you want to delete ${row.name}?`}
                />
              ),
            },
          ]),
    ].map((column): GridColDef<R> => {
      return {
        ...BASE_COLUMN,
        ...column,
        renderCell: (params: GridRenderCellParams<R>) => {
          const { row, value } = params;
          return (
            <Link
              href={getHref(row.id)}
              passHref
              style={{
                color: "black",
                textDecoration: "none",
                width: "100%",
              }}
            >
              {column.renderCell === undefined ? (
                <Tooltip title={String(value)}>
                  <Box
                    sx={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {String(value)}
                  </Box>
                </Tooltip>
              ) : (
                column.renderCell(params)
              )}
            </Link>
          );
        },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DataGrid<R>
      rows={rows}
      sx={RESOURCE_TABLE_STYLE}
      columns={columns}
      getRowId={(row) => row.id}
      disableRowSelectionOnClick
      autoPageSize
      getRowHeight={() => "auto"}
      initialState={{
        sorting: {
          sortModel: [{ field: "name", sort: "asc" }], // Set initial sorting by name in ascending order
        },
      }}
    />
  );
}
