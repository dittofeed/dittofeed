import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
} from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import {
  CompletionStatus,
  DeleteSegmentRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";
import { pick } from "remeda/dist/commonjs/pick";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { monospaceCell } from "../lib/datagridCells";
import DeleteDialog from "./confirmDeleteDialog";

interface Row {
  id: string;
  name: string;
  journeys: { name: string; id: string }[];
  lastRecomputed: string;
  updatedAt: string;
}

const baseColumn: Partial<GridColDef<Row>> = {
  flex: 1,
  sortable: false,
  filterable: false,
  renderCell: monospaceCell,
};

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
      ]),
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

  segments.forEach((segment) => {
    const row: Row = {
      id: segment.id,
      name: segment.name,
      updatedAt: segment.updatedAt
        ? new Date(segment.updatedAt).toISOString()
        : "Not Updated",
      journeys: segment.journeys ?? [],
      lastRecomputed: segment.lastRecomputed
        ? new Date(segment.lastRecomputed).toISOString()
        : "Not Re-Computed ",
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
    ]),
  );

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteSegmentRequest,
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
      }}
      getRowId={(row) => row.id}
      onRowClick={(params) => {
        router.push({
          pathname: `/segments/${params.id}`,
        });
      }}
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
          field: "journeys",
          headerName: "Journeys Used By",
          renderCell: ({ row }: { row: Row }) => {
            const currentRow = row;
            if (currentRow.journeys.length === 0) {
              return;
            }
            return (
              <div
                style={{
                  padding: "0.5rem",
                }}
              >
                <FormControl
                  sx={{
                    width: 200,
                    height: 40,
                  }}
                  size="small"
                >
                  <InputLabel>
                    {currentRow.journeys.length}{" "}
                    {currentRow.journeys.length === 1 ? "Journey" : "Journeys"}
                  </InputLabel>
                  <Select label="Journeys">
                    {currentRow.journeys.map((journey) => {
                      return (
                        <MenuItem key={journey.id}>
                          <Tooltip title={journey.name}>
                            <Link
                              href={`/journeys/${journey.id}`}
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
                              {journey.name}
                            </Link>
                          </Tooltip>
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              </div>
            );
          },
        },
        {
          field: "lastRecomputed",
          headerName: "Last Recomputed",
        },
        {
          field: "actions",
          headerName: "Action",
          width: 180,
          sortable: false,
          // eslint-disable-next-line react/no-unused-prop-types
          renderCell: ({ row }: { row: Row }) => (
            <DeleteDialog
              onConfirm={() => {
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
              }}
              title="Delete Segment"
              message="Are you sure you want to delete this segment?"
            />
          ),
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
