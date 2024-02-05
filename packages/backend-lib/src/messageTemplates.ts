import { MailDataRequired } from "@sendgrid/mail";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import { SUBSCRIPTION_SECRET_NAME } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import {
  ResendRequiredData,
  sendMail as sendMailResend,
} from "./destinations/resend";
import { sendMail as sendMailSendgrid } from "./destinations/sendgrid";
import { sendMail as sendMailSmtp } from "./destinations/smtp";
import { sendSms as sendSmsTwilio } from "./destinations/twilio";
import { renderLiquid } from "./liquid";
import logger from "./logger";
import prisma from "./prisma";
import {
  inSubscriptionGroup,
  SubscriptionGroupDetails,
} from "./subscriptionGroups";
import {
  BackendMessageSendResult,
  BadWorkspaceConfigurationType,
  ChannelType,
  EmailProviderSecret,
  EmailProviderType,
  EmailTemplate,
  InternalEventType,
  MessageSendFailure,
  MessageSkippedType,
  MessageTemplate,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  SmsProviderConfig,
  SmsProviderType,
  UpsertMessageTemplateResource,
} from "./types";
import { UserPropertyAssignments } from "./userProperties";

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
  data: UpsertMessageTemplateResource,
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
  subscriptionGroupDetails,
  useDraft,
}: {
  workspaceId: string;
  templateId: string;
  channel: ChannelType;
  subscriptionGroupDetails?: SubscriptionGroupDetails;
  useDraft?: boolean;
}): Promise<
  Result<
    {
      messageTemplateDefinition: MessageTemplateResourceDefinition;
      subscriptionGroupSecret: string | null;
    },
    MessageSendFailure
  >
> {
  if (
    subscriptionGroupDetails &&
    !inSubscriptionGroup(subscriptionGroupDetails)
  ) {
    const { type: subscriptionGroupType, action: subscriptionGroupAction } =
      subscriptionGroupDetails;
    return err({
      type: InternalEventType.MessageSkipped,
      variant: {
        type: MessageSkippedType.SubscriptionState,
        action: subscriptionGroupAction,
        subscriptionGroupType,
      },
    });
  }

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
    const message = "failed to parse message template definition";
    logger().error(
      {
        templateId,
        workspaceId,
        err: messageTemplateResult.error,
      },
      message,
    );
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageTemplateMisconfigured,
        message,
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
      "message template not found",
    );
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageTemplateNotFound,
      },
    });
  }
  const messageTemplateDefinition = useDraft
    ? messageTemplate.draft ?? messageTemplate.definition
    : messageTemplate.definition;

  if (!messageTemplateDefinition) {
    logger().debug(
      {
        messageTemplate,
      },
      "message template has no definition",
    );

    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageTemplateNotFound,
      },
    });
  }
  return ok({
    messageTemplateDefinition,
    subscriptionGroupSecret: subscriptionGroupSecret?.value ?? null,
  });
}

interface SendMessageParameters {
  workspaceId: string;
  templateId: string;
  userPropertyAssignments: UserPropertyAssignments;
  channel: ChannelType;
  subscriptionGroupDetails?: SubscriptionGroupDetails;
  messageTags?: Record<string, string>;
  useDraft: boolean;
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
  subscriptionGroupDetails,
  messageTags,
  useDraft,
}: Omit<SendMessageParameters, "channel">): Promise<BackendMessageSendResult> {
  const [getSendModelsResult, defaultEmailProvider] = await Promise.all([
    getSendMessageModels({
      workspaceId,
      templateId,
      channel: ChannelType.Email,
      useDraft,
      subscriptionGroupDetails,
    }),
    prisma().defaultEmailProvider.findUnique({
      where: {
        workspaceId,
      },
      include: {
        emailProvider: {
          include: {
            secret: true,
          },
        },
      },
    }),
  ]);
  if (getSendModelsResult.isErr()) {
    return err(getSendModelsResult.error);
  }
  const { messageTemplateDefinition, subscriptionGroupSecret } =
    getSendModelsResult.value;

  if (!defaultEmailProvider?.emailProvider) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageServiceProviderNotFound,
      },
    });
  }

  if (messageTemplateDefinition.type !== ChannelType.Email) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageTemplateMisconfigured,
        message: "message template is not an email template",
      },
    });
  }
  const identifierKey = CHANNEL_IDENTIFIERS[ChannelType.Email];
  const renderedValuesResult = renderValues({
    userProperties: userPropertyAssignments,
    identifierKey,
    subscriptionGroupId: subscriptionGroupDetails?.id,
    workspaceId,
    templates: {
      from: {
        contents: messageTemplateDefinition.from,
      },
      subject: {
        contents: messageTemplateDefinition.subject,
      },
      body: {
        contents: messageTemplateDefinition.body,
        mjml: true,
      },
      ...(messageTemplateDefinition.replyTo
        ? {
            replyTo: {
              contents: messageTemplateDefinition.replyTo,
            },
          }
        : undefined),
    },
    secrets: subscriptionGroupSecret
      ? {
          [SUBSCRIPTION_SECRET_NAME]: subscriptionGroupSecret,
        }
      : undefined,
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
  const identifier = userPropertyAssignments[identifierKey];
  if (!identifier || typeof identifier !== "string") {
    return err({
      type: InternalEventType.MessageSkipped,
      variant: {
        type: MessageSkippedType.MissingIdentifier,
        identifierKey,
      },
    });
  }
  const { from, subject, body, replyTo } = renderedValuesResult.value;
  const to = identifier;

  const unvalidatedSecretConfig =
    defaultEmailProvider.emailProvider.secret?.configValue;

  if (!unvalidatedSecretConfig) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
        message:
          "Missing messaging service provider config. Configure in settings.",
      },
    });
  }

  const secretConfigResult = schemaValidateWithErr(
    defaultEmailProvider.emailProvider.secret?.configValue,
    EmailProviderSecret,
  );
  if (secretConfigResult.isErr()) {
    logger().error(
      {
        err: secretConfigResult.error,
        unvalidatedSecretConfig,
      },
      "message service provider config malformed",
    );
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
        message:
          "Application error: message service provider config malformed.",
      },
    });
  }
  const secretConfig = secretConfigResult.value;

  switch (defaultEmailProvider.emailProvider.type) {
    case EmailProviderType.Smtp: {
      if (secretConfig.type !== EmailProviderType.Smtp) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `expected sendgrid secret config but got ${secretConfig.type}`,
          },
        });
      }
      const { host, port } = secretConfig;
      if (!host) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `missing host in smtp config`,
          },
        });
      }
      const numPort = port?.length ? parseInt(port, 10) : undefined;
      if (numPort && Number.isNaN(numPort)) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `invalid port in smtp config`,
          },
        });
      }
      const result = await sendMailSmtp({
        ...secretConfig,
        from,
        to,
        subject,
        replyTo,
        body,
        host,
        port: numPort,
      });
      if (result.isErr()) {
        return err({
          type: InternalEventType.MessageFailure,
          variant: {
            type: ChannelType.Email,
            provider: result.error,
          },
        });
      }
      return ok({
        type: InternalEventType.MessageSent,
        variant: {
          type: ChannelType.Email,
          from,
          body,
          to,
          subject,
          replyTo,
          provider: {
            type: EmailProviderType.Smtp,
            messageId: result.value.messageId,
          },
        },
      });
    }
    case EmailProviderType.Sendgrid: {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (secretConfig.type !== EmailProviderType.Sendgrid) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `expected sendgrid secret config but got ${secretConfig.type}`,
          },
        });
      }
      const mailData: MailDataRequired = {
        to,
        from,
        subject,
        html: body,
        replyTo,
        customArgs: {
          workspaceId,
          templateId,
          ...messageTags,
        },
      };

      if (!secretConfig.apiKey) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `missing apiKey in sendgrid secret config`,
          },
        });
      }

      const result = await sendMailSendgrid({
        mailData,
        apiKey: secretConfig.apiKey,
      });

      if (result.isErr()) {
        return err({
          type: InternalEventType.MessageFailure,
          variant: {
            type: ChannelType.Email,
            provider: {
              type: EmailProviderType.Sendgrid,
              // Necessary because the types on sendgrid's lib are wrong
              body: JSON.stringify(result.error.response.body),
              status: result.error.code,
            },
          },
        });
      }
      return ok({
        type: InternalEventType.MessageSent,
        variant: {
          type: ChannelType.Email,
          from,
          body,
          to,
          subject,
          replyTo,
          provider: {
            type: EmailProviderType.Sendgrid,
          },
        },
      });
    }

    case EmailProviderType.Resend: {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (secretConfig.type !== EmailProviderType.Resend) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `expected resend secret config but got ${secretConfig.type}`,
          },
        });
      }

      const mailData: ResendRequiredData = {
        to,
        from,
        subject,
        html: body,
        reply_to: replyTo,
        tags: [
          {
            name: "workspaceId",
            value: workspaceId,
          },
          {
            name: "templateId",
            value: templateId,
          },
          ...(messageTags
            ? Object.entries(messageTags).map(([name, value]) => ({
                name,
                value,
              }))
            : []),
        ],
      };

      if (!secretConfig.apiKey) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `missing apiKey in sendgrid secret config`,
          },
        });
      }

      const result = await sendMailResend({
        mailData,
        apiKey: secretConfig.apiKey,
      });

      if (result.isErr()) {
        return err({
          type: InternalEventType.MessageFailure,
          variant: {
            type: ChannelType.Email,
            provider: {
              type: EmailProviderType.Resend,
              name: result.error.name,
              message: result.error.message,
            },
          },
        });
      }
      return ok({
        type: InternalEventType.MessageSent,
        variant: {
          type: ChannelType.Email,
          from,
          body,
          to,
          subject,
          replyTo,
          provider: {
            type: EmailProviderType.Resend,
          },
        },
      });
    }
    case EmailProviderType.Test:
      return ok({
        type: InternalEventType.MessageSent,
        variant: {
          type: ChannelType.Email,
          from,
          body,
          to,
          subject,
          replyTo,
          provider: {
            type: EmailProviderType.Test,
          },
        },
      });
    default: {
      return err({
        type: InternalEventType.BadWorkspaceConfiguration,
        variant: {
          type: BadWorkspaceConfigurationType.MessageServiceProviderNotFound,
        },
      });
    }
  }
}

export async function sendSms({
  workspaceId,
  templateId,
  userPropertyAssignments,
  subscriptionGroupDetails,
  useDraft,
}: Omit<SendMessageParameters, "channel">): Promise<BackendMessageSendResult> {
  const [getSendModelsResult, defaultProvider] = await Promise.all([
    getSendMessageModels({
      workspaceId,
      templateId,
      channel: ChannelType.Sms,
      useDraft,
      subscriptionGroupDetails,
    }),
    prisma().defaultSmsProvider.findUnique({
      where: {
        workspaceId,
      },
      include: {
        smsProvider: {
          include: {
            secret: true,
          },
        },
      },
    }),
  ]);
  if (getSendModelsResult.isErr()) {
    return err(getSendModelsResult.error);
  }
  const { messageTemplateDefinition } = getSendModelsResult.value;

  if (!defaultProvider) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageServiceProviderNotFound,
      },
    });
  }
  const smsConfig = defaultProvider.smsProvider.secret.configValue;

  const parsedConfigResult = schemaValidateWithErr(
    smsConfig,
    SmsProviderConfig,
  );
  if (parsedConfigResult.isErr()) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
        message: parsedConfigResult.error.message,
      },
    });
  }

  if (messageTemplateDefinition.type !== ChannelType.Sms) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageTemplateMisconfigured,
        message: "message template is not an sms template",
      },
    });
  }
  const identifierKey = CHANNEL_IDENTIFIERS[ChannelType.Sms];

  const renderedValuesResult = renderValues({
    userProperties: userPropertyAssignments,
    identifierKey,
    subscriptionGroupId: subscriptionGroupDetails?.id,
    workspaceId,
    templates: {
      body: {
        contents: messageTemplateDefinition.body,
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
  const identifier = userPropertyAssignments[identifierKey];
  if (!identifier || typeof identifier !== "string") {
    return err({
      type: InternalEventType.MessageSkipped,
      variant: {
        type: MessageSkippedType.MissingIdentifier,
        identifierKey,
      },
    });
  }
  const { body } = renderedValuesResult.value;
  const to = identifier;

  switch (defaultProvider.smsProvider.type) {
    case SmsProviderType.Twilio: {
      const { accountSid, authToken, messagingServiceSid } =
        parsedConfigResult.value;

      if (!accountSid || !authToken || !messagingServiceSid) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `missing accountSid, authToken, or messagingServiceSid in sms provider config`,
          },
        });
      }

      const result = await sendSmsTwilio({
        body,
        accountSid,
        authToken,
        messagingServiceSid,
        to,
      });

      if (result.isErr()) {
        return err({
          type: InternalEventType.MessageFailure,
          variant: {
            type: ChannelType.Sms,
            provider: {
              type: SmsProviderType.Twilio,
              message: result.error.message,
            },
          },
        });
      }
      return ok({
        type: InternalEventType.MessageSent,
        variant: {
          type: ChannelType.Sms,
          body,
          to,
          provider: {
            type: SmsProviderType.Twilio,
            sid: result.value.sid,
          },
        },
      });
    }
    case SmsProviderType.Test:
      return ok({
        type: InternalEventType.MessageSent,
        variant: {
          type: ChannelType.Sms,
          body,
          to,
          provider: {
            type: SmsProviderType.Test,
          },
        },
      });
    default: {
      return err({
        type: InternalEventType.BadWorkspaceConfiguration,
        variant: {
          type: BadWorkspaceConfigurationType.MessageServiceProviderNotFound,
        },
      });
    }
  }
}

export async function sendMessage(
  params: SendMessageParameters,
): Promise<BackendMessageSendResult> {
  switch (params.channel) {
    case ChannelType.Email:
      return sendEmail(params);
    case ChannelType.Sms:
      return sendSms(params);
    case ChannelType.MobilePush:
      throw new Error("not implemented");
  }
}
