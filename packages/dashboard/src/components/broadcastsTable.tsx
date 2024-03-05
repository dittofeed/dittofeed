import { DataGrid, GridColDef } from "@mui/x-data-grid";
import Link from "next/link";
import React from "react";

import { useAppStore } from "../lib/appStore";
import { monospaceCell } from "../lib/datagridCells";
import { RESOURCE_TABLE_STYLE } from "./resourceTable";

interface Row {
  id: string;
  name: string;
  updatedAt: string;
  triggeredAt: string;
}

const baseColumn: Partial<GridColDef<Row>> = {
  flex: 1,
  sortable: false,
  filterable: false,
  renderCell: monospaceCell,
};

export default function BroadcastsTable() {
  const broadcasts = useAppStore((store) => store.broadcasts);

  const broadcastsRow: Row[] = [];

  broadcasts.forEach((broadcast) => {
    const row: Row = {
      id: broadcast.id,
      name: broadcast.name,
      updatedAt: new Date(broadcast.updatedAt).toISOString(),
      triggeredAt: broadcast.triggeredAt
        ? new Date(broadcast.triggeredAt).toISOString()
        : "Not Triggered",
    };
    broadcastsRow.push(row);
  });

  return (
    <DataGrid
      rows={broadcastsRow}
      sx={{
        ...RESOURCE_TABLE_STYLE,
      }}
      getRowId={(row) => row.id}
      autoPageSize
      columns={[
        {
          field: "name",
          headerName: "Name",
        },
        {
          field: "updatedAt",
          headerName: "Updated At",
        },
        {
          field: "triggeredAt",
          headerName: "Sent At",
        },
      ].map((c) => ({
        ...baseColumn,
        ...c,
        // eslint-disable-next-line react/no-unused-prop-types
        renderCell: ({ row }: { row: Row }) => (
          <Link
            href={`/broadcasts/segment/${row.id}`}
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
            {String(row[c.field as keyof Row])}
          </Link>
        ),
      }))}
      initialState={{
        pagination: {
          paginationModel: {
            pageSize: 5,
          },
        },
      }}
      pageSizeOptions={[1, 5, 10, 25]}
      getRowHeight={() => "auto"}
    />
  );
}
