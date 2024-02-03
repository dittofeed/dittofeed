import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useRouter } from "next/router";
import React from "react";

import { useAppStore } from "../lib/appStore";
import { monospaceCell } from "../lib/datagridCells";

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
  const router = useRouter();
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
        height: "100%",
        width: "100%",
        // disable cell selection style
        ".MuiDataGrid-cell:focus": {
          outline: "none",
        },
        // pointer cursor on ALL rows
        "& .MuiDataGrid-row:hover": {
          cursor: "pointer",
        },
      }}
      getRowId={(row) => row.id}
      onRowClick={(params) => {
        router.push({
          pathname: `/broadcasts/segment/${params.id}`,
        });
      }}
      autoHeight
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
      ].map((c) => ({ ...baseColumn, ...c }))}
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
