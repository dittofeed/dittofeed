import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { CHANNEL_NAMES } from "isomorphic-lib/src/constants";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  DeleteMessageTemplateRequest,
  EmailTemplateResource,
  EmptyResponse,
  MobilePushTemplateResource,
  NarrowedMessageTemplateResource,
  SmsTemplateResource,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import React, { useMemo } from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { monospaceCell } from "../lib/datagridCells";
import DeleteDialog from "./confirmDeleteDialog";

interface Row {
  id: string;
  name: string;
  updatedAt: string;
  journeys?: string;
  definition?:
    | EmailTemplateResource
    | MobilePushTemplateResource
    | SmsTemplateResource;
  draft?:
    | EmailTemplateResource
    | MobilePushTemplateResource
    | SmsTemplateResource;
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

export interface TemplatesTableProps {
  label: string;
}

export default function TemplatesTable({ label }: TemplatesTableProps) {
  const router = useRouter();
  const messagesResult = useAppStore((store) => store.messages);

  const setMessageTemplateDeleteRequest = useAppStore(
    (store) => store.setMessageTemplateDeleteRequest
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const messageTemplateDeleteRequest = useAppStore(
    (store) => store.messageTemplateDeleteRequest
  );
  const deleteMessageTemplate = useAppStore((store) => store.deleteMessage);

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteMessageTemplateRequest
  ) => {
    if (!deleteRequest) {
      return;
    }
    deleteMessageTemplate(deleteRequest.id);
  };

  const { emailTemplates, mobilePushTemplates, smsTemplates } = useMemo(() => {
    const messages =
      messagesResult.type === CompletionStatus.Successful
        ? messagesResult.value
        : [];
    return messages.reduce<{
      emailTemplates: NarrowedMessageTemplateResource<EmailTemplateResource>[];
      mobilePushTemplates: NarrowedMessageTemplateResource<MobilePushTemplateResource>[];
      smsTemplates: NarrowedMessageTemplateResource<SmsTemplateResource>[];
    }>(
      (acc, template) => {
        const definition = template.draft ?? template.definition;
        if (!definition) {
          return acc;
        }
        switch (definition.type) {
          case ChannelType.Email:
            acc.emailTemplates.push({
              ...template,
              updatedAt: template.updatedAt,
              journeys: template.journeys ?? "",
              definition,
            });
            break;
          case ChannelType.MobilePush:
            acc.mobilePushTemplates.push({
              ...template,
              updatedAt: template.updatedAt,
              journeys: template.journeys ?? "",
              definition,
            });
            break;
          case ChannelType.Sms:
            acc.smsTemplates.push({
              ...template,
              updatedAt: template.updatedAt,
              journeys: template.journeys ?? "",
              definition,
            });
            break;
          default: {
            const { type } = definition;
            assertUnreachable(type);
          }
        }
        return acc;
      },
      { emailTemplates: [], mobilePushTemplates: [], smsTemplates: [] }
    );
  }, [messagesResult]);

  let rows: Row[];
  let routeName: string;
  if (label === CHANNEL_NAMES[ChannelType.Email]) {
    rows = emailTemplates.map((template) => ({
      ...template,
      updatedAt: new Date(template.updatedAt).toISOString(),
    }));
    routeName = "email";
  } else if (label === CHANNEL_NAMES[ChannelType.MobilePush]) {
    rows = mobilePushTemplates.map((template) => ({
      ...template,
      updatedAt: new Date(template.updatedAt).toISOString(),
    }));
    routeName = "mobile-push";
  } else {
    rows = smsTemplates.map((template) => ({
      ...template,
      updatedAt: new Date(template.updatedAt).toISOString(),
    }));
    routeName = "sms";
  }

  return (
    <DataGrid
      rows={rows}
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
          pathname: `/templates/${routeName}/${params.id}`,
        });
      }}
      autoHeight
      columns={[
        {
          field: "name",
          headerName: "Name",
          width: 50,
        },
        {
          field: "updatedAt",
          headerName: "Last Updated",
        },
        {
          field: "journeys",
          headerName: "Journeys Used By",
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
              const definition = currentRow.draft ?? currentRow.definition;
              if (!definition) {
                return null;
              }

              const deleteData: DeleteMessageTemplateRequest = {
                id: currentRow.id,
                type: definition.type,
              };
              const handleDelete = apiRequestHandlerFactory({
                request: messageTemplateDeleteRequest,
                setRequest: setMessageTemplateDeleteRequest,
                responseSchema: EmptyResponse,
                setResponse: setDeleteResponse,
                onSuccessNotice: `Deleted template ${currentRow.name}.`,
                onFailureNoticeHandler: () =>
                  `API Error: Failed to delete template ${currentRow.name}.`,
                requestConfig: {
                  method: "DELETE",
                  url: `${apiBase}/api/content/templates`,
                  data: deleteData,
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
                title="Delete Template"
                message="Are you sure you want to delete this template?"
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
    />
  );
}
