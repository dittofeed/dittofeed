import { Delete } from "@mui/icons-material";
import { Button } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import {
  CompletionStatus,
  DeleteSegmentRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import React from "react";
import { pick } from "remeda/dist/commonjs/pick";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { monospaceCell } from "../lib/datagridCells";

interface Row {
  id: string;
  name: string;
  updatedAt: string;
}

const baseColumn: Partial<GridColDef<Row>> = {
  flex: 1,
  sortable: false,
  filterable: false,
  renderCell: monospaceCell,
};

declare module "@mui/x-data-grid" {
  interface FooterPropsOverrides {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    onNextPage: () => void;
    onPreviousPage: () => void;
    status: "a" | "b";
  }
}

export default function SegmentsTable() {
  const router = useRouter();

  const { segments: segmentsRequest, workspace: workspaceRequest } =
    useAppStore((store) =>
      pick(store, [
        "segments",
        "segmentDownloadRequest",
        "setSegmentDownloadRequest",
        "apiBase",
        "workspace",
      ])
    );
  const segments =
    segmentsRequest.type === CompletionStatus.Successful
      ? segmentsRequest.value
      : [];
  const workspace =
    workspaceRequest.type === CompletionStatus.Successful
      ? workspaceRequest.value
      : null;

  const segmentsRow: Row[] = [];
  // eslint-disable-next-line array-callback-return
  segments.map((segment) => {
    const row: Row = {
      id: segment.id,
      name: segment.name,
      updatedAt: new Date(segment.updatedAt).toISOString(),
    };
    segmentsRow.push(row);
  });

  const {
    setSegmentDeleteRequest,
    apiBase,
    segmentDeleteRequest,
    deleteSegment,
  } = useAppStore((store) =>
    pick(store, [
      "setSegmentDeleteRequest",
      "apiBase",
      "segmentDeleteRequest",
      "deleteSegment",
    ])
  );

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteSegmentRequest
  ) => {
    if (!deleteRequest) {
      return;
    }
    deleteSegment(deleteRequest.id);
  };

  if (!workspace) {
    console.error("No workspace found");
    return null;
  }

  return (
    <DataGrid
      rows={segmentsRow}
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
          pathname: `/journeys/${params.id}`,
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
          field: "actions",
          headerName: "Action",
          width: 180,
          sortable: false,
          disableClickEventBubbling: true,
          // eslint-disable-next-line react/no-unused-prop-types
          renderCell: ({ row }: { row: Row }) => {
            const onClick = () => {
              const currentRow = row;
              const handleDelete = apiRequestHandlerFactory({
                request: segmentDeleteRequest,
                setRequest: setSegmentDeleteRequest,
                responseSchema: EmptyResponse,
                setResponse: setDeleteResponse,
                onSuccessNotice: `Deleted segment ${currentRow.name}.`,
                onFailureNoticeHandler: () =>
                  `API Error: Failed to delete segment ${currentRow.name}.`,
                requestConfig: {
                  method: "DELETE",
                  url: `${apiBase}/api/segments`,
                  data: {
                    id: currentRow.id,
                  },
                  headers: {
                    "Content-Type": "application/json",
                  },
                },
              });

              handleDelete();
            };

            return (
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={onClick}
              >
                <Delete />
              </Button>
            );
          },
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
    />
  );
}
