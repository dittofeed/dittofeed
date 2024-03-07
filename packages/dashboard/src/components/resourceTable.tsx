import { Theme } from "@emotion/react";
import { SxProps } from "@mui/material";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import Link from "next/link";
import { useMemo } from "react";

export const RESOURCE_TABLE_STYLE: SxProps<Theme> = {
  height: "100%",
  width: "100%",
  ".MuiDataGrid-row:first-child": {
    borderTop: "1px solid lightgray",
  },
  ".MuiDataGrid-row": {
    borderBottom: "1px solid lightgray",
  },
  // disable cell selection style
  ".MuiDataGrid-cell:focus": {
    outline: "none",
  },
  // pointer cursor on ALL rows
  "& .MuiDataGrid-row:hover": {
    cursor: "pointer",
  },
};

interface BaseRow {
  id: string;
  name: string;
  updatedAt: Date;
}

const BASE_COLUMN = {
  flex: 1,
  sortable: false,
  filterable: false,
} as const;

export function ResourceTable<R extends BaseRow>({
  rows,
  getHref,
  additionalColumns,
}: {
  rows: R[];
  getHref: (id: string) => string;
  additionalColumns: GridColDef<R>[];
}) {
  const columns: GridColDef<R>[] = useMemo(() => {
    const baseColumns: GridColDef<R>[] = [
      {
        field: "name",
        headerName: "Name",
      },
      {
        field: "updatedAt",
        headerName: "Updated At",
      },
    ];
    return [...baseColumns, ...additionalColumns].map(
      (column): GridColDef<R> => {
        return {
          ...BASE_COLUMN,
          ...column,
          renderCell: (params: GridRenderCellParams<R>) => {
            const { row, value } = params;
            return (
              <Link
                href={getHref(row.id)}
                passHref
                onClick={(e) => {
                  e.stopPropagation();
                }}
                style={{
                  color: "black",
                  textDecoration: "none",
                  width: "100%",
                }}
              >
                {column.renderCell === undefined
                  ? String(value)
                  : column.renderCell(params)}
              </Link>
            );
          },
        };
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DataGrid<R>
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      autoPageSize
    />
  );
}
