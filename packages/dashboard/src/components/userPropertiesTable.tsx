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
  DeleteUserPropertyRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import React from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { monospaceCell } from "../lib/datagridCells";
import DeleteDialog from "./confirmDeleteDialog";
import { RESOURCE_TABLE_STYLE } from "./resourceTable";

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
  const workspace = useAppStore((store) => store.workspace);
  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : "";
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
        ...RESOURCE_TABLE_STYLE,
      }}
      getRowId={(row) => row.id}
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
          headerName: "Templates Used By",
          renderCell: ({ row }: { row: Row }) => {
            const currentRow = row;
            if (currentRow.templates.length === 0) {
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
                    {currentRow.templates.length}{" "}
                    {currentRow.templates.length === 1
                      ? "Template"
                      : "Templates"}
                  </InputLabel>
                  <Select label="Templates">
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
                        <MenuItem key={template.id}>
                          <Tooltip title={template.name}>
                            <Link
                              href={`/templates/${type}/${template.id}`}
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
                              {template.name}
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
          field: "actions",
          headerName: "Action",
          // eslint-disable-next-line react/no-unused-prop-types
          renderCell: ({ row }: { row: Row }) => (
            <DeleteDialog
              onConfirm={() => {
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
                      workspaceId,
                    },
                    headers: {
                      "Content-Type": "application/json",
                    },
                  },
                });
                handleDelete();
              }}
              title="Delete User Property"
              message="Are you sure you want to delete this user property?"
            />
          ),
        },
      ].map((c) => ({
        ...baseColumn,
        ...c,
        // eslint-disable-next-line react/no-unused-prop-types
        renderCell: ({ row }: { row: Row }) => (
          <Link
            href={`/user-properties/${row.id}`}
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
            {c.renderCell === undefined
              ? String(row[c.field as keyof Row])
              : c.renderCell({ row })}
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
