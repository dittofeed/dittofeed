import { DataGrid, GridColDef } from "@mui/x-data-grid";
import {
  CompletionStatus,
  DeleteJourneyRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import React from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { monospaceCell } from "../lib/datagridCells";
import DeleteDialog from "./confirmDeleteDialog";

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

export default function JourneysTable() {
  const router = useRouter();

  const setJourneyDeleteRequest = useAppStore(
    (store) => store.setJourneyDeleteRequest,
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const journeyDeleteRequest = useAppStore(
    (store) => store.journeyDeleteRequest,
  );
  const deleteJourney = useAppStore((store) => store.deleteJourney);

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteJourneyRequest,
  ) => {
    if (!deleteRequest) {
      return;
    }
    deleteJourney(deleteRequest.id);
  };

  const journeysResult = useAppStore((store) => store.journeys);
  const journeys =
    journeysResult.type === CompletionStatus.Successful
      ? journeysResult.value
      : [];

  const journeysRow: Row[] = [];

  journeys.forEach((journey) => {
    const row: Row = {
      id: journey.id,
      name: journey.name,
      updatedAt: new Date(journey.updatedAt).toISOString(),
    };
    journeysRow.push(row);
  });

  return (
    <DataGrid
      rows={journeysRow}
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
                  request: journeyDeleteRequest,
                  setRequest: setJourneyDeleteRequest,
                  responseSchema: EmptyResponse,
                  onSuccessNotice: `Deleted journey ${currentRow.name}.`,
                  onFailureNoticeHandler: () =>
                    `API Error: Failed to delete journey ${currentRow.name}.`,
                  setResponse: setDeleteResponse,
                  requestConfig: {
                    method: "DELETE",
                    url: `${apiBase}/api/journeys`,
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
              title="Delete Journey"
              message="Are you sure you want to delete this journey?"
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
