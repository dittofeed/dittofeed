import { messageTemplatePath } from "isomorphic-lib/src/messageTemplates";
import protectedUserProperties from "isomorphic-lib/src/protectedUserProperties";
import {
  ChannelType,
  CompletionStatus,
  DeleteUserPropertyRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import React, { useMemo } from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../lib/appStore";
import {
  BaseResourceRow,
  RelatedResourceSelect,
  ResourceTable,
} from "./resourceTable";

interface Row extends BaseResourceRow {
  updatedAt: string;
  templates: {
    id: string;
    name: string;
    type: ChannelType;
  }[];
  lastRecomputed: string;
}

export default function UserPropertiesTable() {
  const {
    workspace: workspaceResult,
    userProperties: userPropertiesResult,
    userPropertyMessages,
    setUserPropertyDeleteRequest,
    apiBase,
    userPropertyDeleteRequest,
    deleteUserProperty,
  } = useAppStorePick([
    "userProperties",
    "workspace",
    "userPropertyMessages",
    "setUserPropertyDeleteRequest",
    "apiBase",
    "userPropertyDeleteRequest",
    "deleteUserProperty",
  ]);

  const workspaceId =
    workspaceResult.type === CompletionStatus.Successful
      ? workspaceResult.value.id
      : null;

  const usersPropertiesRow: Row[] = useMemo(() => {
    const userProperties =
      userPropertiesResult.type === CompletionStatus.Successful
        ? userPropertiesResult.value
        : [];

    return userProperties.map((userProperty) => {
      const isProtected = protectedUserProperties.has(userProperty.name);
      const templates = Object.entries(
        userPropertyMessages[userProperty.id] ?? {},
      ).map(([id, template]) => ({
        ...template,
        id,
      }));

      const row: Row = {
        id: userProperty.id,
        name: userProperty.name,
        disableDelete: isProtected,
        updatedAt: userProperty.updatedAt
          ? new Date(userProperty.updatedAt).toISOString()
          : "Not Updated",
        templates,
        lastRecomputed: userProperty.lastRecomputed
          ? new Date(userProperty.lastRecomputed).toISOString()
          : "Not Re-Computed",
      };
      return row;
    });
  }, [userPropertiesResult, userPropertyMessages]);

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteUserPropertyRequest,
  ) => {
    if (!deleteRequest) {
      return;
    }
    deleteUserProperty(deleteRequest.id);
  };

  if (!workspaceId) {
    return null;
  }

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
          field: "templates",
          headerName: "Templates Used By",
          // eslint-disable-next-line react/no-unused-prop-types
          renderCell: ({ row }: { row: Row }) => {
            const currentRow = row;
            if (currentRow.templates.length === 0) {
              return;
            }

            const relatedLabel = `${currentRow.templates.length} ${currentRow.templates.length === 1 ? "Template" : "Templates"}`;
            const relatedResources = currentRow.templates.map((template) => ({
              href: messageTemplatePath({
                id: template.id,
                channel: template.type,
              }),
              name: template.name,
            }));

            return (
              <RelatedResourceSelect
                label={relatedLabel}
                relatedResources={relatedResources}
              />
            );
          },
        },
        {
          field: "lastRecomputed",
          headerName: "Last Re-Computed",
        },
      ]}
    />
  );
}
