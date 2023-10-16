import { SUBSCRIPTION_SECRET_NAME } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import logger from "./logger";
import prisma from "./prisma";
import {
  BackendMessageSendResult,
  BadWorkspaceConfigurationType,
  ChannelType,
  EmailTemplate,
  InternalEventType,
  MessageSendFailure,
  MessageTemplate,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  Secret,
  SubscriptionGroupType,
  UpsertMessageTemplateResource,
  UserSubscriptionAction,
} from "./types";
import { UserPropertyAssignments } from "./userProperties";
import { renderLiquid } from "./liquid";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";

export function enrichMessageTemplate({
  id,
  name,
  workspaceId,
  definition,
  draft,
}: MessageTemplate): Result<MessageTemplateResource, Error> {
  const enrichedDefintion = definition
    ? schemaValidateWithErr(definition, MessageTemplateResourceDefinition)
    : ok(undefined);
  const enrichedDraft = draft
    ? schemaValidateWithErr(draft, MessageTemplateResourceDefinition)
    : ok(undefined);
  if (enrichedDefintion.isErr()) {
    return err(enrichedDefintion.error);
  }
  if (enrichedDraft.isErr()) {
    return err(enrichedDraft.error);
  }

  return ok({
    id,
    name,
    workspaceId,
    definition: enrichedDefintion.value,
    draft: enrichedDraft.value,
  });
}

export function enrichEmailTemplate({
  id,
  workspaceId,
  name,
  body,
  subject,
  from,
  replyTo,
}: EmailTemplate): MessageTemplateResource {
  return {
    id,
    name,
    workspaceId,
    definition: {
      type: ChannelType.Email,
      subject,
      from,
      body,
      replyTo: replyTo ?? undefined,
    },
  };
}

export async function findMessageTemplate({
  id,
  channel,
}: {
  id: string;
  channel: ChannelType;
}): Promise<Result<MessageTemplateResource | null, Error>> {
  const template = await prisma().messageTemplate.findUnique({
    where: {
      id,
    },
  });
  if (!template) {
    return ok(null);
  }

  return enrichMessageTemplate(template).map((t) => {
    const definition = t.draft ?? t.definition ?? null;
    return definition && definition.type === channel ? t : null;
  });
}

export async function upsertMessageTemplate(
  data: UpsertMessageTemplateResource
): Promise<MessageTemplateResource> {
  let messageTemplate: MessageTemplate;
  if (data.name && data.workspaceId) {
    messageTemplate = await prisma().messageTemplate.upsert({
      where: {
        id: data.id,
      },
      create: {
        workspaceId: data.workspaceId,
        name: data.name,
        id: data.id,
        definition: data.definition,
        draft: data.draft,
      },
      update: {
        workspaceId: data.workspaceId,
        name: data.name,
        id: data.id,
        definition: data.definition,
        draft: data.draft,
      },
    });
  } else {
    messageTemplate = await prisma().messageTemplate.update({
      where: {
        id: data.id,
      },
      data: {
        workspaceId: data.workspaceId,
        name: data.name,
        id: data.id,
        definition: data.definition,
        draft: data.draft,
      },
    });
  }
  return unwrap(enrichMessageTemplate(messageTemplate));
}

export async function findMessageTemplates({
  workspaceId,
  includeInternal,
}: {
  workspaceId: string;
  includeInternal?: boolean;
}): Promise<MessageTemplateResource[]> {
  return (
    await prisma().messageTemplate.findMany({
      where: {
        workspaceId,
        resourceType: includeInternal ? undefined : "Declarative",
      },
    })
  ).map((mt) => unwrap(enrichMessageTemplate(mt)));
}

async function getSendMessageModels({
  templateId,
  workspaceId,
  channel,
}: {
  workspaceId: string;
  templateId: string;
  channel: ChannelType;
}): Promise<
  Result<
    {
      messageTemplate: MessageTemplateResource;
      subscriptionGroupSecret: Secret | null;
    },
    MessageSendFailure
  >
> {
  const [messageTemplateResult, subscriptionGroupSecret] = await Promise.all([
    findMessageTemplate({
      id: templateId,
      channel,
    }),
    prisma().secret.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: SUBSCRIPTION_SECRET_NAME,
        },
      },
    }),
  ]);
  if (messageTemplateResult.isErr()) {
    logger().error(
      {
        templateId,
        workspaceId,
        err: messageTemplateResult.error,
      },
      "failed to parse message template definition"
    );
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageTemplateMisconfigured,
      },
    });
  }
  const messageTemplate = messageTemplateResult.value;
  if (!messageTemplate) {
    logger().error(
      {
        templateId,
        workspaceId,
      },
      "message template not found"
    );
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageTemplateNotFound,
      },
    });
  }
  return ok({
    messageTemplate: messageTemplateResult.value,
    subscriptionGroupSecret,
  });
}

interface SendMessageParameters {
  workspaceId: string;
  templateId: string;
  userPropertyAssignments: UserPropertyAssignments;
  channel: ChannelType;
  subscriptionGroupAction: UserSubscriptionAction;
  subscriptionGroupType: SubscriptionGroupType;
  subscriptionGroupId: string;
}

type TemplateDictionary<T> = {
  [K in keyof T]: {
    contents?: string;
    mjml?: boolean;
  };
};

function renderValues<T extends TemplateDictionary<T>>({
  templates,
  ...rest
}: Omit<Parameters<typeof renderLiquid>[0], "template"> & {
  templates: T;
}): Result<
  { [K in keyof T]: string },
  {
    field: string;
    error: string;
  }
> {
  const result: Record<string, string> = {};

  for (const key in templates) {
    if (Object.prototype.hasOwnProperty.call(templates, key)) {
      const { contents: template, mjml } = templates[key];
      try {
        result[key] = renderLiquid({
          ...rest,
          template,
          mjml,
        });
      } catch (e) {
        const error = e as Error;
        return err({
          field: key,
          error: error.message,
        });
      }
    }
  }

  const coercedResult = result as { [K in keyof T]: string };
  return ok(coercedResult);
}

export async function sendEmail({
  workspaceId,
  templateId,
  userPropertyAssignments,
  subscriptionGroupId,
}: Omit<SendMessageParameters, "channel">): Promise<BackendMessageSendResult> {
  const [getSendModelsResult, defaultEmailProvider] = await Promise.all([
    getSendMessageModels({
      workspaceId,
      templateId,
      channel: ChannelType.Email,
    }),
    prisma().defaultEmailProvider.findUnique({
      where: {
        workspaceId,
      },
      include: { emailProvider: true },
    }),
  ]);
  if (getSendModelsResult.isErr()) {
    return err(getSendModelsResult.error);
  }
  const { messageTemplate, subscriptionGroupSecret } =
    getSendModelsResult.value;

  if (!defaultEmailProvider?.emailProvider) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageServiceProviderNotFound,
      },
    });
  }

  if (messageTemplate.definition.type !== ChannelType.Email) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageTemplateMisconfigured,
        message: "message template is not an email template",
      },
    });
  }
  const renderedValuesResult = renderValues({
    userProperties: userPropertyAssignments,
    identifierKey: CHANNEL_IDENTIFIERS[ChannelType.Email],
    subscriptionGroupId,
    workspaceId,
    templates: {
      from: {
        contents: messageTemplate.definition.from,
      },
      subject: {
        contents: messageTemplate.definition.subject,
      },
      body: {
        contents: messageTemplate.definition.body,
        mjml: true,
      },
    },
  });
  if (renderedValuesResult.isErr()) {
    const { error, field } = renderedValuesResult.error;
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageTemplateRenderError,
        field,
        error,
      },
    });
  }
}

export async function sendMessage(
  params: SendMessageParameters
): Promise<BackendMessageSendResult> {
  switch (params.channel) {
    case ChannelType.Email:
      return sendEmail(params);
    case ChannelType.Sms:
      throw new Error("not implemented");
    case ChannelType.MobilePush:
      throw new Error("not implemented");
  }
}
