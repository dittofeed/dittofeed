import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
} from "@mui/material";
import protectedUserProperties from "isomorphic-lib/src/protectedUserProperties";
import {
  CompletionStatus,
  DeleteUserPropertyRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import React from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { BaseResourceRow, ResourceTable } from "./resourceTable";

interface Row extends BaseResourceRow {
  updatedAt: string;
  // TODO DF-415: simplify types
  templates: {
    id: string;
    name: string;
    type: string;
  }[];
  lastRecomputed: string;
}

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
    const isProtected = protectedUserProperties.has(userProperty.name);
    const row: Row = {
      id: userProperty.id,
      name: userProperty.name,
      disableDelete: isProtected,
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
    <ResourceTable<Row>
      rows={usersPropertiesRow}
      getHref={(id) => `/user-properties/${id}`}
      onDelete={({ row }) => {
        const currentRow = row;
        const handleDelete = apiRequestHandlerFactory({
          request: userPropertyDeleteRequest,
          setRequest: setUserPropertyDeleteRequest,
          responseSchema: EmptyResponse,
          setResponse: setDeleteResponse,
          onSuccessNotice: `Deleted user property ${currentRow.name}.`,
          onFailureNoticeHandler: () =>
            `API Error: Failed to user property ${currentRow.name}.`,
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
      additionalColumns={[
        {
          field: "lastRecomputed",
          headerName: "Last Re-Computed",
        },

        {
          field: "templates",
          headerName: "Templates Used By",
          // eslint-disable-next-line react/no-unused-prop-types
          renderCell: ({ row }: { row: Row }) => {
            const currentRow = row;
            if (currentRow.templates.length === 0) {
              return;
            }
            return (
              <FormControl
                sx={{
                  width: 200,
                  height: 40,
                }}
                size="small"
              >
                <InputLabel>
                  {currentRow.templates.length}{" "}
                  {currentRow.templates.length === 1 ? "Template" : "Templates"}
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
            );
          },
        },
      ]}
    />
  );
}
