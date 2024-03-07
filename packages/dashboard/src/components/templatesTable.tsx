import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
  useTheme,
} from "@mui/material";
import { CHANNEL_NAMES } from "isomorphic-lib/src/constants";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  DeleteMessageTemplateRequest,
  EmailTemplateResource,
  EmptyResponse,
  JourneyNodeType,
  MobilePushTemplateResource,
  NarrowedMessageTemplateResource,
  SmsTemplateResource,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import React, { useMemo } from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../lib/appStore";
import { getJourneysUsedBy, MinimalJourneyMap } from "../lib/journeys";
import { BaseResourceRow, ResourceTable } from "./resourceTable";

interface Row extends BaseResourceRow {
  journeys: { name: string; id: string }[];
  // TODO DF-415: simplify types
  definition?:
    | EmailTemplateResource
    | MobilePushTemplateResource
    | SmsTemplateResource;
  // TODO DF-415: simplify types
  draft?:
    | EmailTemplateResource
    | MobilePushTemplateResource
    | SmsTemplateResource;
}

export interface TemplatesTableProps {
  label: string;
}

export default function TemplatesTable({ label }: TemplatesTableProps) {
  const theme = useTheme();
  const {
    apiBase,
    messages: messagesResult,
    journeys: journeysResult,
    setMessageTemplateDeleteRequest,
    messageTemplateDeleteRequest,
    deleteMessage: deleteMessageTemplate,
  } = useAppStorePick([
    "apiBase",
    "messages",
    "journeys",
    "setMessageTemplateDeleteRequest",
    "messageTemplateDeleteRequest",
    "deleteMessage",
  ]);

  const journeysUsedBy: MinimalJourneyMap = useMemo(() => {
    if (journeysResult.type !== CompletionStatus.Successful) {
      return new Map();
    }
    return journeysResult.value.reduce((acc, journey) => {
      const journeyMap = new Map();
      journeyMap.set(journey.id, journey.name);

      journey.definition.nodes.forEach((node) => {
        if (node.type === JourneyNodeType.MessageNode) {
          const { templateId } = node.variant;
          acc.set(templateId, journeyMap);
        }
      });
      return acc;
    }, new Map());
  }, [journeysResult]);

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
              definition,
            });
            break;
          case ChannelType.MobilePush:
            acc.mobilePushTemplates.push({
              ...template,
              updatedAt: template.updatedAt,
              definition,
            });
            break;
          case ChannelType.Sms:
            acc.smsTemplates.push({
              ...template,
              updatedAt: template.updatedAt,
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
      journeys: getJourneysUsedBy(journeysUsedBy, template.id),
      updatedAt: new Date(template.updatedAt).toISOString(),
    }));
    routeName = "email";
  } else if (label === CHANNEL_NAMES[ChannelType.MobilePush]) {
    rows = mobilePushTemplates.map((template) => ({
      ...template,
      journeys: getJourneysUsedBy(journeysUsedBy, template.id),
      updatedAt: new Date(template.updatedAt).toISOString(),
    }));
    routeName = "mobile-push";
  } else {
    rows = smsTemplates.map((template) => ({
      ...template,
      journeys: getJourneysUsedBy(journeysUsedBy, template.id),
      updatedAt: new Date(template.updatedAt).toISOString(),
    }));
    routeName = "sms";
  }

  return (
    <ResourceTable<Row>
      getHref={(id) => `/templates/${routeName}/${id}`}
      rows={rows}
      onDelete={({ row: currentRow }) => {
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
      additionalColumns={[
        {
          field: "journeys",
          headerName: "Journeys Used By",
          // eslint-disable-next-line react/no-unused-prop-types
          renderCell: ({ row }: { row: Row }) => {
            const currentRow = row;
            if (currentRow.journeys.length === 0) {
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
                  {currentRow.journeys.length}{" "}
                  {currentRow.journeys.length === 1 ? "Journey" : "Journeys"}
                </InputLabel>
                <Select
                  label="Journeys"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
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
            );
          },
        },
      ]}
    />
  );
}
