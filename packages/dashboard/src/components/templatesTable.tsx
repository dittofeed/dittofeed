import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
  useTheme,
} from "@mui/material";
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
import Link from "next/link";
import React, { useMemo } from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { monospaceCell } from "../lib/datagridCells";
import DeleteDialog from "./confirmDeleteDialog";
import { RESOURCE_TABLE_STYLE } from "./resourceTable";

interface Row {
  id: string;
  name: string;
  updatedAt: string;
  journeys?: { name: string; id: string }[];
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

export interface TemplatesTableProps {
  label: string;
}

export default function TemplatesTable({ label }: TemplatesTableProps) {
  const messagesResult = useAppStore((store) => store.messages);
  const theme = useTheme();

  const setMessageTemplateDeleteRequest = useAppStore(
    (store) => store.setMessageTemplateDeleteRequest,
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const messageTemplateDeleteRequest = useAppStore(
    (store) => store.messageTemplateDeleteRequest,
  );
  const deleteMessageTemplate = useAppStore((store) => store.deleteMessage);

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteMessageTemplateRequest,
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
              journeys: template.journeys ?? [],
              definition,
            });
            break;
          case ChannelType.MobilePush:
            acc.mobilePushTemplates.push({
              ...template,
              updatedAt: template.updatedAt,
              journeys: template.journeys ?? [],
              definition,
            });
            break;
          case ChannelType.Sms:
            acc.smsTemplates.push({
              ...template,
              updatedAt: template.updatedAt,
              journeys: template.journeys ?? [],
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
      { emailTemplates: [], mobilePushTemplates: [], smsTemplates: [] },
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
          headerName: "Last Updated",
        },
        {
          field: "journeys",
          headerName: "Journeys Used By",
          renderCell: ({ row }: { row: Row, value:  }) => {
            const currentRow = row;
            if (currentRow.journeys?.length === 0) {
              return null;
            }
            return (
              <FormControl
                sx={{
                  width: theme.spacing(20),
                  height: theme.spacing(5),
                }}
                size="small"
              >
                <InputLabel>
                  {currentRow.journeys?.length}{" "}
                  {currentRow.journeys?.length === 1 ? "Journey" : "Journeys"}
                </InputLabel>
                <Select
                  label="Journeys"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  {currentRow.journeys?.map((journey) => {
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
                const definition = currentRow.draft ?? currentRow.definition;
                if (!definition) {
                  return;
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
              }}
              title="Delete Template"
              message="Are you sure you want to delete this template?"
            />
          ),
        },
      ].map((c) => ({
        ...baseColumn,
        ...c,
        // eslint-disable-next-line react/no-unused-prop-types
        renderCell: ({ row, value }: { row: Row; value: string }) => (
          <Box
            sx={{
              padding: 1,
            }}
          >
            <Link
              href={`/templates/${routeName}/${row.id}`}
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
                ? value
                : c.renderCell({ row, value })}
            </Link>
          </Box>
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
