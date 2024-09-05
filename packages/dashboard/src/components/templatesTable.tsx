import { CHANNEL_NAMES } from "isomorphic-lib/src/constants";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  DeleteMessageTemplateRequest,
  EmailTemplateResource,
  EmptyResponse,
  JourneyNodeType,
  MessageTemplateResourceDefinition,
  MessageTemplateResourceDraft,
  MobilePushTemplateResource,
  NarrowedMessageTemplateResource,
  SmsTemplateResource,
  WebhookTemplateResource,
} from "isomorphic-lib/src/types";
import React, { useMemo } from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../lib/appStore";
import { getJourneysUsedBy, MinimalJourneyMap } from "../lib/journeys";
import {
  BaseResourceRow,
  RelatedResourceSelect,
  ResourceTable,
} from "./resourceTable";

interface Row extends BaseResourceRow {
  journeys: { name: string; id: string }[];
  definition?: MessageTemplateResourceDefinition;
  draft?: MessageTemplateResourceDraft;
}

export interface TemplatesTableProps {
  label: string;
}

export default function TemplatesTable({ label }: TemplatesTableProps) {
  const {
    apiBase,
    messages: messagesResult,
    journeys: journeysResult,
    setMessageTemplateDeleteRequest,
    messageTemplateDeleteRequest,
    deleteMessage: deleteMessageTemplate,
    workspace,
  } = useAppStorePick([
    "apiBase",
    "messages",
    "journeys",
    "setMessageTemplateDeleteRequest",
    "messageTemplateDeleteRequest",
    "deleteMessage",
    "workspace",
  ]);

  const journeysUsedBy: MinimalJourneyMap = useMemo(() => {
    if (journeysResult.type !== CompletionStatus.Successful) {
      return new Map();
    }
    return journeysResult.value.reduce((acc, journey) => {
      const journeyMap = new Map();
      journeyMap.set(journey.id, journey.name);
      if (!journey.definition) {
        return acc;
      }

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

  const {
    emailTemplates,
    mobilePushTemplates,
    smsTemplates,
    webhookTemplates,
  } = useMemo(() => {
    const messages =
      messagesResult.type === CompletionStatus.Successful
        ? messagesResult.value
        : [];
    return messages.reduce<{
      emailTemplates: NarrowedMessageTemplateResource<EmailTemplateResource>[];
      mobilePushTemplates: NarrowedMessageTemplateResource<MobilePushTemplateResource>[];
      smsTemplates: NarrowedMessageTemplateResource<SmsTemplateResource>[];
      webhookTemplates: NarrowedMessageTemplateResource<WebhookTemplateResource>[];
    }>(
      (acc, template) => {
        if (!template.definition) {
          return acc;
        }

        switch (template.definition.type) {
          case ChannelType.Email:
            acc.emailTemplates.push({
              ...template,
              updatedAt: template.updatedAt,
              definition: template.definition,
            });
            break;
          case ChannelType.MobilePush:
            acc.mobilePushTemplates.push({
              ...template,
              updatedAt: template.updatedAt,
              definition: template.definition,
            });
            break;
          case ChannelType.Sms:
            acc.smsTemplates.push({
              ...template,
              updatedAt: template.updatedAt,
              definition: template.definition,
            });
            break;
          case ChannelType.Webhook:
            acc.webhookTemplates.push({
              ...template,
              updatedAt: template.updatedAt,
              definition: template.definition,
            });
            break;
          default: {
            const { type } = template.definition;
            assertUnreachable(type);
          }
        }
        return acc;
      },
      {
        emailTemplates: [],
        mobilePushTemplates: [],
        smsTemplates: [],
        webhookTemplates: [],
      },
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
  } else if (label === CHANNEL_NAMES[ChannelType.Webhook]) {
    rows = webhookTemplates.map((template) => ({
      ...template,
      journeys: getJourneysUsedBy(journeysUsedBy, template.id),
      updatedAt: new Date(template.updatedAt).toISOString(),
    }));
    routeName = "webhook";
  } else {
    rows = smsTemplates.map((template) => ({
      ...template,
      journeys: getJourneysUsedBy(journeysUsedBy, template.id),
      updatedAt: new Date(template.updatedAt).toISOString(),
    }));
    routeName = "sms";
  }

  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null;
  if (!workspaceId) {
    return null;
  }
  return (
    <ResourceTable<Row>
      getHref={(id) => `/templates/${routeName}/${id}`}
      rows={rows}
      onDelete={({ row: currentRow }) => {
        const definition = currentRow.draft ?? currentRow.definition;
        if (!definition || !workspaceId) {
          return;
        }
        const deleteData: DeleteMessageTemplateRequest = {
          id: currentRow.id,
          type: definition.type,
          workspaceId,
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
            const relatedLabel = `${currentRow.journeys.length} ${currentRow.journeys.length === 1 ? "Journey" : "Journeys"}`;
            const relatedResources = currentRow.journeys.map((journey) => ({
              href: `/journeys/${journey.id}`,
              name: journey.name,
            }));
            return (
              <RelatedResourceSelect
                label={relatedLabel}
                relatedResources={relatedResources}
              />
            );
          },
        },
      ]}
    />
  );
}
