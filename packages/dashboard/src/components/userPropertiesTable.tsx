import { Tooltip } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import {
  CompletionStatus,
  DeleteUserPropertyRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { monospaceCell } from "../lib/datagridCells";
import DeleteDialog from "./confirmDeleteDialog";

interface Row {
  id: string;
  properties: string;
  updatedAt: string;
  templates: {
    id: string;
    name: string;
    type: string;
  }[];
  lastRecomputed: string;
}

const baseColumn: Partial<GridColDef<Row>> = {
  flex: 1,
  sortable: false,
  filterable: false,
  renderCell: monospaceCell,
};

export default function UserPropertiesTable() {
  const router = useRouter();

  const userPropertiesResult = useAppStore((store) => store.userProperties);
  const userProperties =
    userPropertiesResult.type === CompletionStatus.Successful
      ? userPropertiesResult.value
      : [];

  const usersPropertiesRow: Row[] = [];

  userProperties.forEach((userProperty) => {
    const row: Row = {
      id: userProperty.id,
      properties: userProperty.name,
      updatedAt: userProperty.updatedAt
        ? new Date(userProperty.updatedAt).toISOString()
        : "Not Updated",
      templates: userProperty.templates ?? [],
      lastRecomputed: userProperty.lastRecomputed
        ? new Date(userProperty.lastRecomputed).toISOString()
        : "Not Re-Computed",
    };
    usersPropertiesRow.push(row);
  });

  const setUserPropertyDeleteRequest = useAppStore(
    (store) => store.setUserPropertyDeleteRequest,
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const userPropertyDeleteRequest = useAppStore(
    (store) => store.userPropertyDeleteRequest,
  );
  const deleteUserProperty = useAppStore((store) => store.deleteUserProperty);

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteUserPropertyRequest,
  ) => {
    if (!deleteRequest) {
      return;
    }
    deleteUserProperty(deleteRequest.id);
  };

  return (
    <DataGrid
      rows={usersPropertiesRow}
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
          pathname: `/user-properties/${params.id}`,
        });
      }}
      autoPageSize
      columns={[
        {
          field: "properties",
          headerName: "Name",
        },
        {
          field: "lastRecomputed",
          headerName: "Last Re-Computed",
        },
        {
          field: "updatedAt",
          headerName: "Last Updated",
        },
        {
          field: "templates",
          headerName: "Templates used by",
          renderCell: ({ row }: { row: Row }) => {
            const currentRow = row;
            if (currentRow.templates.length === 0) {
              return (
                <div>
                  <p>No Templates</p>
                </div>
              );
            }
            return (
              <div>
                {currentRow.templates.map((template) => {
                  let type = "email";
                  if (template.type === "Email") {
                    type = "email";
                  } else if (template.type === "Sms") {
                    type = "sms";
                  } else if (template.type === "MobilePush") {
                    type = "mobile-push";
                  }
                  return (
                    <Tooltip title={template.name} key={template.id}>
                      <Link
                        href={`/templates/${type}/${template.id}`}
                        passHref
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        style={{
                          display: "block",
                          margin: "0.2rem 0",
                          backgroundColor: "#f5f5f5",
                          padding: "0.5rem",
                          borderRadius: "0.5rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          textDecoration: "underline",
                          width: 200,
                          maxWidth: "fit-content",
                        }}
                      >
                        {template.name}
                      </Link>
                    </Tooltip>
                  );
                })}
              </div>
            );
          },
        },
        {
          field: "actions",
          headerName: "Action",
          width: 180,
          sortable: false,
          // eslint-disable-next-line react/no-unused-prop-types
          renderCell: ({ row }: { row: Row }) => {
            const onClick = () => {
              const currentRow = row;
              const handleDelete = apiRequestHandlerFactory({
                request: userPropertyDeleteRequest,
                setRequest: setUserPropertyDeleteRequest,
                responseSchema: EmptyResponse,
                setResponse: setDeleteResponse,
                onSuccessNotice: `Deleted user property ${currentRow.properties}.`,
                onFailureNoticeHandler: () =>
                  `API Error: Failed to user property ${currentRow.properties}.`,
                requestConfig: {
                  method: "DELETE",
                  url: `${apiBase}/api/user-properties`,
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
              <DeleteDialog
                onConfirm={onClick}
                title="Delete User Property"
                message="Are you sure you want to delete this user property?"
              />
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
      getRowHeight={() => "auto"}
    />
  );
}
