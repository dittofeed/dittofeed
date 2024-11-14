import { MailDataRequired } from "@sendgrid/mail";
import axios, { AxiosError } from "axios";
import { toMjml } from "emailo/src/toMjml";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import { MESSAGE_ID_HEADER, SecretNames } from "isomorphic-lib/src/constants";
import { messageTemplateDraftToDefinition } from "isomorphic-lib/src/messageTemplates";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  jsonParseSafe,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";
import { Message as PostMarkRequiredFields } from "postmark";
import * as R from "remeda";
import { Overwrite } from "utility-types";

import { getObject, storage } from "./blobStorage";
import { sendMail as sendMailAmazonSes } from "./destinations/amazonses";
import { sendMail as sendMailPostMark } from "./destinations/postmark";
import {
  ResendRequiredData,
  sendMail as sendMailResend,
} from "./destinations/resend";
import { sendMail as sendMailSendgrid } from "./destinations/sendgrid";
import {
  sendMail as sendMailSmtp,
  SendSmtpMailParams,
} from "./destinations/smtp";
import { sendSms as sendSmsTwilio } from "./destinations/twilio";
import { renderLiquid } from "./liquid";
import logger from "./logger";
import {
  constructUnsubscribeHeaders,
  UnsubscribeHeaders,
} from "./messaging/email";
import prisma from "./prisma";
import {
  inSubscriptionGroup,
  SubscriptionGroupDetails,
} from "./subscriptionGroups";
import {
  BackendMessageSendResult,
  BadWorkspaceConfigurationType,
  BlobStorageFile,
  ChannelType,
  EmailProvider,
  EmailProviderSecret,
  EmailProviderType,
  InternalEventType,
  MessageSendFailure,
  MessageSkippedType,
  MessageTags,
  MessageTemplate,
  MessageTemplateRenderError,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  MessageTemplateResourceDraft,
  MessageWebhookServiceFailure,
  MessageWebhookSuccess,
  MobilePushProviderType,
  ParsedWebhookBody,
  Prisma,
  Secret,
  SmsProvider,
  SmsProviderSecret,
  SmsProviderType,
  TwilioSecret,
  UpsertMessageTemplateResource,
  WebhookConfig,
  WebhookResponse,
  WebhookSecret,
} from "./types";
import { UserPropertyAssignments } from "./userProperties";

export function enrichMessageTemplate({
  id,
  name,
  workspaceId,
  definition,
  draft,
  updatedAt,
}: Overwrite<
  MessageTemplate,
  {
    draft?: Prisma.JsonValue;
    definition?: Prisma.JsonValue;
  }
>): Result<MessageTemplateResource, Error> {
  const enrichedDefinition = definition
    ? schemaValidateWithErr(definition, MessageTemplateResourceDefinition)
    : ok(undefined);
  const enrichedDraft = draft
    ? schemaValidateWithErr(draft, MessageTemplateResourceDraft)
    : ok(undefined);
  if (enrichedDefinition.isErr()) {
    return err(enrichedDefinition.error);
  }
  if (enrichedDraft.isErr()) {
    return err(enrichedDraft.error);
  }
  const type = enrichedDefinition.value?.type ?? enrichedDraft.value?.type;
  if (!type) {
    return err(
      new Error("message template has neither a draft nor a definition"),
    );
  }
  const enriched: MessageTemplateResource = {
    id,
    name,
    workspaceId,
    type,
    updatedAt: Number(updatedAt),
    ...(enrichedDefinition.value
      ? { definition: enrichedDefinition.value }
      : {}),
    ...(enrichedDraft.value ? { draft: enrichedDraft.value } : {}),
  };

  return ok(enriched);
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
  const draft = data.draft === null ? Prisma.DbNull : data.draft;

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
        draft,
      },
      update: {
        workspaceId: data.workspaceId,
        name: data.name,
        id: data.id,
        definition: data.definition,
        draft,
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
        draft,
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

export async function findPartialMessageTemplates({
  workspaceId,
  includeInternal,
}: {
  workspaceId: string;
  includeInternal?: boolean;
}): Promise<MessageTemplateResource[]> {
  const messageTemplates = await prisma().messageTemplate.findMany({
    where: {
      workspaceId,
      resourceType: includeInternal ? undefined : "Declarative",
    },
  });
  return messageTemplates.map((mt) =>
    R.omit(unwrap(enrichMessageTemplate(mt)), ["definition", "draft"]),
  );
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
          name: SecretNames.Subscription,
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
  const definitionFromDraft =
    useDraft && messageTemplate.draft
      ? messageTemplateDraftToDefinition(messageTemplate.draft).unwrapOr(null)
      : null;
  const messageTemplateDefinition: MessageTemplateResourceDefinition | null =
    definitionFromDraft ?? messageTemplate.definition ?? null;

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

export interface SendMessageParametersBase {
  workspaceId: string;
  userId: string;
  templateId: string;
  userPropertyAssignments: UserPropertyAssignments;
  subscriptionGroupDetails?: SubscriptionGroupDetails & { name: string };
  messageTags?: MessageTags;
  useDraft: boolean;
}

export interface SendMessageParametersEmail extends SendMessageParametersBase {
  channel: (typeof ChannelType)["Email"];
  providerOverride?: EmailProviderType;
}

export interface SendMessageParametersSms extends SendMessageParametersBase {
  channel: (typeof ChannelType)["Sms"];
  providerOverride?: SmsProviderType;
  disableCallback?: boolean;
}

export interface SendMessageParametersMobilePush
  extends SendMessageParametersBase {
  channel: (typeof ChannelType)["MobilePush"];
  provider?: MobilePushProviderType;
}

export interface SendMessageParametersWebhook
  extends SendMessageParametersBase {
  channel: (typeof ChannelType)["Webhook"];
}

export type SendMessageParameters =
  | SendMessageParametersEmail
  | SendMessageParametersSms
  | SendMessageParametersWebhook
  | SendMessageParametersMobilePush;

type TemplateDictionary<T> = {
  [K in keyof T]: {
    contents?: string;
    mjml?: boolean;
  };
};

interface Attachment {
  mimeType: string;
  data: string;
  name: string;
}

function renderValues<T extends TemplateDictionary<T>>({
  templates,
  ...rest
}: Omit<Parameters<typeof renderLiquid>[0], "template"> & {
  templates: T;
}): Result<
  { [K in keyof T]: T[K]["contents"] },
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

async function getSmsProviderForWorkspace({
  providerOverride,
  workspaceId,
}: {
  workspaceId: string;
  providerOverride?: SmsProviderType;
}): Promise<(SmsProvider & { secret: Secret | null }) | null> {
  if (providerOverride) {
    return prisma().smsProvider.findUnique({
      where: {
        workspaceId_type: {
          workspaceId,
          type: providerOverride,
        },
      },
      include: {
        secret: true,
      },
    });
  }
  const defaultProvider = await prisma().defaultSmsProvider.findUnique({
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
  });
  return defaultProvider?.smsProvider ?? null;
}

async function getSmsProvider({
  providerOverride,
  workspaceId,
}: {
  workspaceId: string;
  providerOverride?: SmsProviderType;
}): Promise<(SmsProvider & { secret: Secret | null }) | null> {
  const provider = await getSmsProviderForWorkspace({
    workspaceId,
    providerOverride,
  });
  logger().debug({ provider }, "sms provider");
  if (provider) {
    return provider;
  }
  const relation = await prisma().workspaceRelation.findFirst({
    where: {
      childWorkspaceId: workspaceId,
    },
  });
  logger().debug({ relation }, "workspace relation");
  if (!relation) {
    return null;
  }
  return getSmsProviderForWorkspace({
    workspaceId: relation.parentWorkspaceId,
    providerOverride,
  });
}

function getMessageFileId({
  messageId,
  name,
}: {
  messageId: string;
  name: string;
}): string {
  return `${messageId}-${name}`;
}

type EmailProviderPayload = (EmailProvider & { secret: Secret | null }) | null;

async function getEmailProviderForWorkspace({
  providerOverride,
  workspaceId,
}: {
  workspaceId: string;
  providerOverride?: EmailProviderType;
}): Promise<EmailProviderPayload> {
  if (providerOverride) {
    return prisma().emailProvider.findUnique({
      where: {
        workspaceId_type: {
          workspaceId,
          type: providerOverride,
        },
      },
      include: {
        secret: true,
      },
    });
  }
  const defaultProvider = await prisma().defaultEmailProvider.findUnique({
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
  });
  return defaultProvider?.emailProvider ?? null;
}

async function getEmailProvider({
  providerOverride,
  workspaceId,
}: {
  workspaceId: string;
  providerOverride?: EmailProviderType;
}): Promise<EmailProviderPayload> {
  const provider = await getEmailProviderForWorkspace({
    workspaceId,
    providerOverride,
  });
  logger().debug({ provider }, "email provider");
  if (provider) {
    return provider;
  }
  const relation = await prisma().workspaceRelation.findFirst({
    where: {
      childWorkspaceId: workspaceId,
    },
  });
  logger().debug({ relation }, "workspace relation");
  if (!relation) {
    return null;
  }
  return getEmailProviderForWorkspace({
    workspaceId: relation.parentWorkspaceId,
    providerOverride,
  });
}

export async function sendEmail({
  workspaceId,
  templateId,
  userPropertyAssignments,
  subscriptionGroupDetails,
  messageTags,
  userId,
  providerOverride,
  useDraft,
}: Omit<
  SendMessageParametersEmail,
  "channel"
>): Promise<BackendMessageSendResult> {
  const [getSendModelsResult, emailProvider] = await Promise.all([
    getSendMessageModels({
      workspaceId,
      templateId,
      channel: ChannelType.Email,
      useDraft,
      subscriptionGroupDetails,
    }),
    getEmailProvider({
      workspaceId,
      providerOverride,
    }),
  ]);
  if (getSendModelsResult.isErr()) {
    return err(getSendModelsResult.error);
  }
  const { messageTemplateDefinition, subscriptionGroupSecret } =
    getSendModelsResult.value;

  if (!emailProvider) {
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
  let emailBody: string;
  if ("emailContentsType" in messageTemplateDefinition) {
    const mjml = toMjml({
      content: messageTemplateDefinition.body,
      mode: "render",
    });
    emailBody = mjml;
  } else {
    emailBody = messageTemplateDefinition.body;
  }
  const renderedValuesResult = renderValues({
    userProperties: userPropertyAssignments,
    identifierKey,
    subscriptionGroupId: subscriptionGroupDetails?.id,
    workspaceId,
    tags: messageTags,
    templates: {
      from: {
        contents: messageTemplateDefinition.from,
      },
      subject: {
        contents: messageTemplateDefinition.subject,
      },
      body: {
        contents: emailBody,
        mjml: true,
      },
      replyTo: {
        contents: messageTemplateDefinition.replyTo,
      },
    },
    secrets: subscriptionGroupSecret
      ? {
          [SecretNames.Subscription]: subscriptionGroupSecret,
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
  const {
    from,
    subject,
    body,
    replyTo: baseReplyTo,
  } = renderedValuesResult.value;
  // don't pass an empty string for reply to values
  const replyTo = !baseReplyTo?.length ? undefined : baseReplyTo;
  const to = identifier;

  let customHeaders: Record<string, string> | undefined;
  if (messageTemplateDefinition.headers) {
    const headersToRender: Record<
      string,
      {
        contents: string;
      }
    > = {};
    for (const header of messageTemplateDefinition.headers) {
      headersToRender[header.name] = {
        contents: header.value,
      };
    }
    const renderedCustomHeaders = renderValues({
      userProperties: userPropertyAssignments,
      identifierKey,
      subscriptionGroupId: subscriptionGroupDetails?.id,
      workspaceId,
      tags: messageTags,
      templates: headersToRender,
    });
    if (renderedCustomHeaders.isErr()) {
      const { error, field } = renderedCustomHeaders.error;
      return err({
        type: InternalEventType.BadWorkspaceConfiguration,
        variant: {
          type: BadWorkspaceConfigurationType.MessageTemplateRenderError,
          field,
          error,
        },
      });
    }
    customHeaders = renderedCustomHeaders.value;
  }

  const unsubscribeHeadersResult: Result<
    UnsubscribeHeaders,
    MessageTemplateRenderError
  > | null =
    subscriptionGroupDetails && subscriptionGroupSecret
      ? constructUnsubscribeHeaders({
          to,
          from,
          userId,
          subscriptionGroupSecret,
          subscriptionGroupName: subscriptionGroupDetails.name,
          workspaceId,
          subscriptionGroupId: subscriptionGroupDetails.id,
        })
      : null;

  // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
  if (unsubscribeHeadersResult && unsubscribeHeadersResult.isErr()) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: unsubscribeHeadersResult.error,
    });
  }
  const unsubscribeHeaders = unsubscribeHeadersResult?.value as
    | Record<string, string>
    | undefined;

  const headers = {
    ...customHeaders,
    ...unsubscribeHeaders,
  };

  const unvalidatedSecretConfig = emailProvider.secret?.configValue;

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
    emailProvider.secret?.configValue,
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
  let attachments: Attachment[] | undefined;
  if (
    messageTemplateDefinition.attachmentUserProperties?.length &&
    messageTags
  ) {
    const s = storage();

    const attachmentPromises =
      messageTemplateDefinition.attachmentUserProperties.map(
        async (attachmentProperty) => {
          const assignment = userPropertyAssignments[attachmentProperty];
          const file = schemaValidateWithErr(assignment, BlobStorageFile);
          if (file.isErr()) {
            return [];
          }

          const { name, key, mimeType } = file.value;
          const object = await getObject(s, {
            key,
          });
          if (!object) {
            return [];
          }
          const attachment: Attachment = {
            mimeType,
            data: object.text,
            name,
          };
          return attachment;
        },
      );

    attachments = (await Promise.all(attachmentPromises)).flat();
  }

  switch (emailProvider.type) {
    case EmailProviderType.Smtp: {
      if (secretConfig.type !== EmailProviderType.Smtp) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `expected smtp secret config but got ${secretConfig.type}`,
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
      const smtpAttachments: SendSmtpMailParams["attachments"] =
        messageTags &&
        attachments?.map((attachment) => ({
          content: attachment.data,
          filename: attachment.name,
          contentType: attachment.mimeType,
        }));

      const result = await sendMailSmtp({
        ...secretConfig,
        from,
        to,
        subject,
        replyTo,
        body,
        host,
        port: numPort,
        headers,
        attachments: smtpAttachments,
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
          headers,
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
      const sendgridAttachments: MailDataRequired["attachments"] =
        messageTags &&
        attachments?.map((attachment) => ({
          content: attachment.data,
          type: attachment.mimeType,
          filename: attachment.name,
          contentId: getMessageFileId({
            messageId: messageTags.messageId,
            name: attachment.name,
          }),
        }));
      const mailData: MailDataRequired = {
        to,
        from,
        subject,
        html: body,
        replyTo,
        headers,
        attachments: sendgridAttachments,
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
          headers,
          replyTo,
          provider: {
            type: EmailProviderType.Sendgrid,
          },
        },
      });
    }
    case EmailProviderType.AmazonSes: {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (secretConfig.type !== EmailProviderType.AmazonSes) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `expected amazon secret config but got ${secretConfig.type}`,
          },
        });
      }
      const mailData: Parameters<typeof sendMailAmazonSes>[0]["mailData"] = {
        to,
        from,
        subject,
        html: body,
        replyTo,
        headers,
        tags: {
          workspaceId,
          templateId,
          ...messageTags,
        },
      };

      if (
        !secretConfig.accessKeyId ||
        !secretConfig.secretAccessKey ||
        !secretConfig.region
      ) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: "missing accesskey or secret in AmazonSES config",
          },
        });
      }

      const result = await sendMailAmazonSes({
        mailData,
        config: {
          accessKeyId: secretConfig.accessKeyId,
          secretAccessKey: secretConfig.secretAccessKey,
          region: secretConfig.region,
        },
      });

      if (result.isErr()) {
        return err({
          type: InternalEventType.MessageFailure,
          variant: {
            type: ChannelType.Email,
            provider: {
              type: EmailProviderType.AmazonSes,
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
          headers,
          replyTo,
          provider: {
            type: EmailProviderType.AmazonSes,
            messageId: result.value.MessageId,
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

      const resendAttachments: ResendRequiredData["attachments"] =
        attachments?.map((attachment) => ({
          filename: attachment.name,
          content: attachment.data,
        }));
      const mailData: ResendRequiredData = {
        to,
        from,
        subject,
        html: body,
        reply_to: replyTo,
        headers,
        tags: messageTags
          ? Object.entries(messageTags).map(([name, value]) => ({
              name,
              value,
            }))
          : [],
        attachments: resendAttachments,
      };

      if (!secretConfig.apiKey) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `missing apiKey in resend secret config`,
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
          headers,
          subject,
          replyTo,
          provider: {
            type: EmailProviderType.Resend,
          },
        },
      });
    }
    case EmailProviderType.PostMark: {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (secretConfig.type !== EmailProviderType.PostMark) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `expected postmark secret config but got ${secretConfig.type}`,
          },
        });
      }

      const postmarkAttachments: PostMarkRequiredFields["Attachments"] =
        messageTags
          ? attachments?.map(({ mimeType, data, name }) => ({
              Name: name,
              ContentType: mimeType,
              Content: data,
              ContentID: getMessageFileId({
                messageId: messageTags.messageId,
                name,
              }),
            }))
          : [];
      const mailData: PostMarkRequiredFields = {
        To: to,
        From: from,
        Subject: subject,
        HtmlBody: body,
        ReplyTo: replyTo,
        Attachments: postmarkAttachments,
        Headers:
          Object.keys(headers).length > 0
            ? Object.entries(headers).map(([name, value]) => ({
                Name: name,
                Value: value,
              }))
            : undefined,
        Metadata: {
          recipient: to,
          from,
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
            message: `missing apiKey in PostMark secret config`,
          },
        });
      }

      const result = await sendMailPostMark({
        mailData,
        apiKey: secretConfig.apiKey,
      });

      if (result.isErr()) {
        return err({
          type: InternalEventType.MessageFailure,
          variant: {
            type: ChannelType.Email,
            provider: {
              type: EmailProviderType.PostMark,
              name: result.error.ErrorCode.toString(),
              message: result.error.Message,
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
          headers,
          provider: {
            type: EmailProviderType.PostMark,
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
          headers,
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
  providerOverride,
  userId,
  messageTags,
  disableCallback = false,
}: Omit<
  SendMessageParametersSms,
  "channel"
>): Promise<BackendMessageSendResult> {
  const [getSendModelsResult, smsProvider] = await Promise.all([
    getSendMessageModels({
      workspaceId,
      templateId,
      channel: ChannelType.Sms,
      useDraft,
      subscriptionGroupDetails,
    }),
    getSmsProvider({
      workspaceId,
      providerOverride,
    }),
  ]);
  if (getSendModelsResult.isErr()) {
    return err(getSendModelsResult.error);
  }
  const { messageTemplateDefinition } = getSendModelsResult.value;

  if (!smsProvider?.secret) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageServiceProviderNotFound,
      },
    });
  }
  const smsConfig = smsProvider.secret.configValue;

  const parsedConfigResult = schemaValidateWithErr(
    smsConfig,
    SmsProviderSecret,
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
    tags: messageTags,
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

  const rawIdentifier = userPropertyAssignments[identifierKey];
  let identifier: string | null;
  switch (typeof rawIdentifier) {
    case "string":
      identifier = rawIdentifier;
      break;
    // in the case of e.g. a phone number, convert to string
    case "number":
      identifier = String(rawIdentifier);
      break;
    default:
      identifier = null;
      break;
  }

  if (!identifier) {
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

  switch (smsProvider.type) {
    case SmsProviderType.Twilio: {
      const { accountSid, authToken, messagingServiceSid } =
        parsedConfigResult.value as TwilioSecret;

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
        userId,
        messagingServiceSid,
        subscriptionGroupId: subscriptionGroupDetails?.id,
        to,
        workspaceId,
        disableCallback,
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

export async function sendWebhook({
  workspaceId,
  templateId,
  userPropertyAssignments,
  subscriptionGroupDetails,
  useDraft,
  messageTags,
}: Omit<
  SendMessageParametersWebhook,
  "channel"
>): Promise<BackendMessageSendResult> {
  const [getSendModelsResult, secret] = await Promise.all([
    getSendMessageModels({
      workspaceId,
      templateId,
      channel: ChannelType.Webhook,
      useDraft,
      subscriptionGroupDetails,
    }),
    await prisma().secret.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: SecretNames.Webhook,
        },
      },
    }),
  ]);
  if (getSendModelsResult.isErr()) {
    return err(getSendModelsResult.error);
  }
  const { messageTemplateDefinition, subscriptionGroupSecret } =
    getSendModelsResult.value;

  const parsedConfigResult: Record<string, string> = secret?.configValue
    ? schemaValidateWithErr(secret.configValue, WebhookSecret)
        .map((c) => R.omit(c, ["type"]))
        .unwrapOr({})
    : {};

  if (messageTemplateDefinition.type !== ChannelType.Webhook) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageTemplateMisconfigured,
        message: "message template is not webhook template",
      },
    });
  }
  const { identifierKey } = messageTemplateDefinition;
  const secrets: Record<string, string> = parsedConfigResult;

  if (subscriptionGroupSecret) {
    secrets[SecretNames.Subscription] = subscriptionGroupSecret;
  }

  const renderedBody = renderValues({
    userProperties: userPropertyAssignments,
    identifierKey,
    subscriptionGroupId: subscriptionGroupDetails?.id,
    workspaceId,
    secrets,
    tags: messageTags,
    templates: {
      body: {
        contents: messageTemplateDefinition.body,
      },
    },
  });
  if (renderedBody.isErr()) {
    const { error, field } = renderedBody.error;
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageTemplateRenderError,
        field,
        error,
      },
    });
  }
  const parsedBody = jsonParseSafe(renderedBody.value.body);
  if (parsedBody.isErr()) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageTemplateRenderError,
        field: "body",
        error: `Failed to parse webhook json payload: ${parsedBody.error.message}`,
      },
    });
  }

  const validatedBody = schemaValidateWithErr(
    parsedBody.value,
    ParsedWebhookBody,
  );
  if (validatedBody.isErr()) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.MessageTemplateRenderError,
        field: "body",
        error: `Failed to validate webhook json payload: ${validatedBody.error.message}`,
      },
    });
  }

  const { config: renderedConfig, secret: renderedSecret } =
    validatedBody.value;

  const renderedConfigHeaders: Record<string, string> =
    renderedConfig.headers ?? {};

  if (messageTags) {
    renderedConfigHeaders[MESSAGE_ID_HEADER] = messageTags.messageId;
  }

  const renderedHeaders = {
    ...renderedConfigHeaders,
    ...(renderedSecret?.headers ?? {}),
  };

  const rawIdentifier = userPropertyAssignments[identifierKey];
  let identifier: string | null;
  switch (typeof rawIdentifier) {
    case "string":
      identifier = rawIdentifier;
      break;
    case "number":
      identifier = String(rawIdentifier);
      break;
    default:
      identifier = null;
      break;
  }

  if (!identifier) {
    return err({
      type: InternalEventType.MessageSkipped,
      variant: {
        type: MessageSkippedType.MissingIdentifier,
        identifierKey,
      },
    });
  }

  try {
    const data: unknown = renderedSecret?.data ?? renderedConfig.data;
    const params: unknown = renderedSecret?.params ?? renderedConfig.params;
    const method = renderedSecret?.method ?? renderedConfig.method;
    const responseType =
      renderedSecret?.responseType ?? renderedConfig.responseType;
    const url = renderedSecret?.url ?? renderedConfig.url;

    const response = await axios({
      url,
      method,
      params,
      data,
      responseType,
      headers: renderedHeaders,
    });

    return ok({
      type: InternalEventType.MessageSent,
      variant: {
        type: ChannelType.Webhook,
        to: identifier,
        request: {
          ...renderedConfig,
          headers: renderedConfigHeaders,
        } satisfies WebhookConfig,
        response: {
          status: response.status,
          headers: response.headers as Record<string, string> | undefined,
          body: response.data,
        } satisfies WebhookResponse,
      } satisfies MessageWebhookSuccess,
    });
  } catch (e) {
    const { response: axiosResponse, code } = e as AxiosError;
    let response: WebhookResponse | undefined;
    if (axiosResponse && Object.keys(axiosResponse).length > 0) {
      const responseHeaders = axiosResponse.headers as
        | Record<string, string>
        | undefined;

      response = {
        status: axiosResponse.status,
        body: axiosResponse.data,
        headers: responseHeaders,
      };
    }
    return err({
      type: InternalEventType.MessageFailure,
      variant: {
        type: ChannelType.Webhook,
        code,
        response,
      } satisfies MessageWebhookServiceFailure,
    });
  }
}

export type Sender = (
  params: SendMessageParameters,
) => Promise<BackendMessageSendResult>;

export async function sendMessage(
  params: SendMessageParameters,
): Promise<BackendMessageSendResult> {
  logger().debug({ params }, "sending message");
  switch (params.channel) {
    case ChannelType.Email:
      return sendEmail(params);
    case ChannelType.Sms:
      return sendSms(params);
    case ChannelType.MobilePush:
      throw new Error("not implemented");
    case ChannelType.Webhook:
      return sendWebhook(params);
  }
}
