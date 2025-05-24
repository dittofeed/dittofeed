import { SESv2ServiceException } from "@aws-sdk/client-sesv2";
import { MessagesMessage as MailChimpMessage } from "@mailchimp/mailchimp_transactional";
import { MailDataRequired } from "@sendgrid/mail";
import axios, { AxiosError } from "axios";
import { and, eq, SQL } from "drizzle-orm";
import { toMjml } from "emailo/src/toMjml";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import { MESSAGE_ID_HEADER, SecretNames } from "isomorphic-lib/src/constants";
import { isWorkspaceWideProvider } from "isomorphic-lib/src/email";
import { messageTemplateDraftToDefinition } from "isomorphic-lib/src/messageTemplates";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  jsonParseSafe,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { err, ok, Result } from "neverthrow";
import { PostgresError } from "pg-error-enum";
import { Message as PostMarkRequiredFields } from "postmark";
import * as R from "remeda";
import { Overwrite } from "utility-types";
import { validate as validateUuid } from "uuid";

import { getObject, storage } from "./blobStorage";
import { db, queryResult } from "./db";
import {
  defaultEmailProvider as dbDefaultEmailProvider,
  defaultSmsProvider as dbDefaultSmsProvider,
  emailProvider as dbEmailProvider,
  messageTemplate as dbMessageTemplate,
  secret as dbSecret,
  smsProvider as dbSmsProvider,
  workspace as dbWorkspace,
} from "./db/schema";
import {
  sendMail as sendMailAmazonSes,
  SesMailData,
} from "./destinations/amazonses";
import { sendMail as sendMailMailchimp } from "./destinations/mailchimp";
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
import {
  Sender as TwilioSender,
  sendSms as sendSmsTwilio,
  TwilioAuth,
} from "./destinations/twilio";
import {
  getAndRefreshGmailAccessToken,
  sendGmailEmail,
  SendGmailEmailParams,
} from "./gmail";
import { renderLiquid } from "./liquid";
import logger from "./logger";
import {
  constructUnsubscribeHeaders,
  UnsubscribeHeaders,
} from "./messaging/email";
import { withSpan } from "./openTelemetry";
import {
  inSubscriptionGroup,
  SubscriptionGroupDetails,
} from "./subscriptionGroups";
import {
  BackendMessageSendResult,
  BadWorkspaceConfigurationType,
  BlobStorageFile,
  ChannelType,
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
  Secret,
  SmsProvider,
  SmsProviderOverride,
  SmsProviderSecret,
  SmsProviderType,
  TwilioSecret,
  TwilioSenderOverrideType,
  UpsertMessageTemplateResource,
  UpsertMessageTemplateValidationError,
  UpsertMessageTemplateValidationErrorType,
  WebhookConfig,
  WebhookResponse,
  WebhookSecret,
} from "./types";
import { UserPropertyAssignments } from "./userProperties";
import { isWorkspaceOccupantType } from "./workspaceOccupantSettings";

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
    draft?: unknown;
    definition?: unknown;
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
  if (!validateUuid(id)) {
    logger().info({ id, channel }, "Invalid message template id");
    return ok(null);
  }
  const template = await db().query.messageTemplate.findFirst({
    where: eq(dbMessageTemplate.id, id),
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
): Promise<
  Result<MessageTemplateResource, UpsertMessageTemplateValidationError>
> {
  if (data.id && !validateUuid(data.id)) {
    return err({
      type: UpsertMessageTemplateValidationErrorType.IdError,
      message: "Invalid message template id, must be a valid v4 UUID",
    });
  }
  const result = await queryResult(
    db()
      .insert(dbMessageTemplate)
      .values({
        id: data.id,
        workspaceId: data.workspaceId,
        name: data.name,
        definition: data.definition,
        draft: data.draft,
        resourceType: data.resourceType,
      })
      .onConflictDoUpdate({
        target: data.id
          ? [dbMessageTemplate.id]
          : [dbMessageTemplate.workspaceId, dbMessageTemplate.name],
        set: {
          name: data.name,
          definition: data.definition,
          draft: data.draft,
          resourceType: data.resourceType,
        },
        setWhere: eq(dbMessageTemplate.workspaceId, data.workspaceId),
      })
      .returning(),
  );
  if (result.isErr()) {
    if (
      result.error.code === PostgresError.UNIQUE_VIOLATION ||
      result.error.code === PostgresError.FOREIGN_KEY_VIOLATION
    ) {
      return err({
        type: UpsertMessageTemplateValidationErrorType.UniqueConstraintViolation,
        message:
          "Names must be unique in workspace. Id's must be globally unique.",
      });
    }
    throw result.error;
  }

  const [messageTemplate] = result.value;
  if (!messageTemplate) {
    return err({
      type: UpsertMessageTemplateValidationErrorType.UniqueConstraintViolation,
      message:
        "Names must be unique in workspace. Id's must be globally unique.",
    });
  }
  return ok(unwrap(enrichMessageTemplate(messageTemplate)));
}

export async function findMessageTemplates({
  workspaceId,
  includeInternal,
}: {
  workspaceId: string;
  includeInternal?: boolean;
}): Promise<MessageTemplateResource[]> {
  const conditions: SQL[] = [eq(dbMessageTemplate.workspaceId, workspaceId)];
  if (!includeInternal) {
    conditions.push(eq(dbMessageTemplate.resourceType, "Declarative"));
  }
  const messageTemplates = await db().query.messageTemplate.findMany({
    where: and(...conditions),
  });
  return messageTemplates.map((mt) => unwrap(enrichMessageTemplate(mt)));
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
    db().query.secret.findFirst({
      where: and(
        eq(dbSecret.workspaceId, workspaceId),
        eq(dbSecret.name, SecretNames.Subscription),
      ),
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

export type SendMessageParametersSms = SendMessageParametersBase &
  SmsProviderOverride & {
    channel: (typeof ChannelType)["Sms"];
    disableCallback?: boolean;
  };

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
    const provider = await db().query.smsProvider.findFirst({
      where: and(
        eq(dbSmsProvider.workspaceId, workspaceId),
        eq(dbSmsProvider.type, providerOverride),
      ),
      with: {
        secret: true,
      },
    });
    return provider ?? null;
  }
  const defaultProvider = await db().query.defaultSmsProvider.findFirst({
    where: eq(dbDefaultSmsProvider.workspaceId, workspaceId),
    with: {
      smsProvider: {
        with: {
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
  const workspace = await db().query.workspace.findFirst({
    where: eq(dbWorkspace.id, workspaceId),
  });
  const parentWorkspaceId = workspace?.parentWorkspaceId;
  if (!parentWorkspaceId) {
    return null;
  }
  return getSmsProviderForWorkspace({
    workspaceId: parentWorkspaceId,
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

function getWebsiteFromFromEmail(from: string): string | null {
  const fromParts = from.split("@");
  if (fromParts.length !== 2 || !fromParts[1]) {
    return null;
  }
  try {
    return new URL(`https://${fromParts[1]}`).origin;
  } catch (error) {
    logger().info({ err: error }, "error getting website from from email");
    return null;
  }
}

async function getEmailProviderSecretForWorkspace({
  providerOverride,
  workspaceId,
}: {
  workspaceId: string;
  providerOverride?: EmailProviderType;
}): Promise<Secret | null> {
  if (providerOverride) {
    const provider = await db().query.emailProvider.findFirst({
      where: and(
        eq(dbEmailProvider.workspaceId, workspaceId),
        eq(dbEmailProvider.type, providerOverride),
      ),
      with: {
        secret: true,
      },
    });
    return provider?.secret ?? null;
  }
  const defaultProvider = await db().query.defaultEmailProvider.findFirst({
    where: eq(dbDefaultEmailProvider.workspaceId, workspaceId),
    with: {
      emailProvider: {
        with: {
          secret: true,
        },
      },
    },
  });

  return defaultProvider?.emailProvider?.secret ?? null;
}

const PROVIDER_NOT_FOUND_ERROR = {
  type: InternalEventType.BadWorkspaceConfiguration,
  variant: {
    type: BadWorkspaceConfigurationType.MessageServiceProviderNotFound,
  },
} as const;

async function getEmailProviderSecretForWorkspaceHierarchical({
  workspaceId,
  providerOverride,
}: {
  workspaceId: string;
  providerOverride?: EmailProviderType;
}): Promise<Secret | null> {
  const secret = await getEmailProviderSecretForWorkspace({
    workspaceId,
    providerOverride,
  });
  if (secret) {
    return secret;
  }
  const workspace = await db().query.workspace.findFirst({
    where: eq(dbWorkspace.id, workspaceId),
  });
  const parentWorkspaceId = workspace?.parentWorkspaceId;
  if (!parentWorkspaceId) {
    return null;
  }
  return getEmailProviderSecretForWorkspace({
    workspaceId: parentWorkspaceId,
    providerOverride,
  });
}

async function getEmailProvider({
  providerOverride,
  workspaceId,
  workspaceOccupantId,
  workspaceOccupantType,
}: {
  workspaceId: string;
  providerOverride?: EmailProviderType;
  workspaceOccupantId?: string;
  workspaceOccupantType?: string;
}): Promise<Result<EmailProviderSecret, MessageSendFailure>> {
  let emailProviderSecret: EmailProviderSecret | null = null;
  if (providerOverride && !isWorkspaceWideProvider(providerOverride)) {
    if (
      !workspaceOccupantId ||
      !isWorkspaceOccupantType(workspaceOccupantType)
    ) {
      logger().error(
        {
          workspaceId,
          workspaceOccupantId,
          workspaceOccupantType,
        },
        "email provider not found for non-workspace-wide provider. workspaceOccupantId and workspaceOccupantType must be provided.",
      );
      return err(PROVIDER_NOT_FOUND_ERROR);
    }
    switch (providerOverride) {
      case EmailProviderType.Gmail: {
        const gmailCredentials = await getAndRefreshGmailAccessToken({
          workspaceId,
          workspaceOccupantId,
          workspaceOccupantType,
        });
        if (!gmailCredentials) {
          logger().info(
            {
              workspaceId,
              workspaceOccupantId,
              workspaceOccupantType,
            },
            "gmail credentials not found",
          );
          return err(PROVIDER_NOT_FOUND_ERROR);
        }
        emailProviderSecret = {
          type: EmailProviderType.Gmail,
          email: gmailCredentials.email,
          accessToken: gmailCredentials.accessToken,
          refreshToken: gmailCredentials.refreshToken,
          expiresAt: gmailCredentials.expiresAt,
        };
        break;
      }
      default:
        assertUnreachable(providerOverride);
    }
  } else {
    const secret = await getEmailProviderSecretForWorkspaceHierarchical({
      workspaceId,
      providerOverride,
    });
    if (!secret) {
      logger().info(
        {
          workspaceId,
          providerOverride,
        },
        "email provider not found for workspace",
      );
      return err(PROVIDER_NOT_FOUND_ERROR);
    }

    const secretConfigResult = schemaValidateWithErr(
      secret.configValue,
      EmailProviderSecret,
    );
    if (secretConfigResult.isErr()) {
      return err({
        type: InternalEventType.BadWorkspaceConfiguration,
        variant: {
          type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
          message:
            "Application error: message service provider config malformed.",
        },
      });
    }
    emailProviderSecret = secretConfigResult.value;
  }
  return ok(emailProviderSecret);
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
  const [getSendModelsResult, emailProviderResult] = await Promise.all([
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
      workspaceOccupantId: messageTags?.workspaceOccupantId,
      workspaceOccupantType: messageTags?.workspaceOccupantType,
    }),
  ]);
  if (getSendModelsResult.isErr()) {
    return err(getSendModelsResult.error);
  }
  const { messageTemplateDefinition, subscriptionGroupSecret } =
    getSendModelsResult.value;

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
      name: {
        contents: messageTemplateDefinition.name,
      },
      cc: {
        contents: messageTemplateDefinition.cc,
      },
      bcc: {
        contents: messageTemplateDefinition.bcc,
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
    name: baseName,
    cc: unsplitCc,
    bcc: unsplitBcc,
  } = renderedValuesResult.value;
  const replyTo = !baseReplyTo?.length ? undefined : baseReplyTo;
  const emailName = !baseName?.length ? undefined : baseName;
  const cc = unsplitCc?.split(",").flatMap((email) => {
    const trimmed = email.trim();
    return trimmed.length ? trimmed : [];
  });
  const bcc = unsplitBcc?.split(",").flatMap((email) => {
    const trimmed = email.trim();
    return trimmed.length ? trimmed : [];
  });
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
            logger().error(
              {
                err: file.error,
                assignment,
                attachmentProperty,
                templateId,
                workspaceId,
              },
              "error validating attachment user property",
            );
            return [];
          }

          const { name, key, mimeType } = file.value;
          const object = await getObject(s, {
            key,
          });
          if (!object) {
            logger().error(
              {
                key,
                workspaceId,
                mimeType,
                name,
                templateId,
              },
              "error getting attachment object",
            );
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
  // To set on the message sent event
  const attachmentsSent = attachments?.map(({ name, mimeType }) => ({
    name,
    mimeType,
  }));

  if (emailProviderResult.isErr()) {
    return err(emailProviderResult.error);
  }
  const emailProvider = emailProviderResult.value;

  switch (emailProvider.type) {
    case EmailProviderType.Smtp: {
      const { host, port } = emailProvider;
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
        ...emailProvider,
        from,
        to,
        subject,
        replyTo,
        name: emailName,
        body,
        host,
        port: numPort,
        headers,
        cc,
        bcc,
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
          cc: unsplitCc,
          bcc: unsplitBcc,
          name: emailName,
          attachments: attachmentsSent,
          provider: {
            type: EmailProviderType.Smtp,
            messageId: result.value.messageId,
          },
        },
      });
    }
    case EmailProviderType.Sendgrid: {
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
        from: {
          email: from,
          name: emailName,
        },
        subject,
        html: body,
        replyTo,
        headers,
        cc,
        bcc,
        attachments: sendgridAttachments,
        customArgs: {
          workspaceId,
          templateId,
          ...messageTags,
        },
      };

      if (!emailProvider.apiKey) {
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
        apiKey: emailProvider.apiKey,
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
          cc: unsplitCc,
          bcc: unsplitBcc,
          name: emailName,
          attachments: attachmentsSent,
          provider: {
            type: EmailProviderType.Sendgrid,
          },
        },
      });
    }
    case EmailProviderType.AmazonSes: {
      const sesAttachments = attachments?.map((attachment) => ({
        filename: attachment.name,
        content: attachment.data,
        contentType: attachment.mimeType,
      }));

      const fromWithName = emailName ? `${emailName} <${from}>` : from;
      const mailData: SesMailData = {
        to,
        from: fromWithName,
        subject,
        html: body,
        replyTo,
        cc,
        bcc,
        headers,
        attachments: sesAttachments,
        tags: {
          workspaceId,
          templateId,
          ...messageTags,
        },
      };

      if (
        !emailProvider.accessKeyId ||
        !emailProvider.secretAccessKey ||
        !emailProvider.region
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
          accessKeyId: emailProvider.accessKeyId,
          secretAccessKey: emailProvider.secretAccessKey,
          region: emailProvider.region,
        },
      });

      if (result.isErr()) {
        let message: string | undefined;
        if (result.error instanceof SESv2ServiceException) {
          message = result.error.message;
        } else if (result.error instanceof Error) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          message = result.error.message;
        } else {
          logger().error(
            {
              err: result.error,
              workspaceId,
              messageId: messageTags?.messageId,
            },
            "Unknown error sending email",
          );
          message = "Unknown error";
        }
        return err({
          type: InternalEventType.MessageFailure,
          variant: {
            type: ChannelType.Email,
            provider: {
              type: EmailProviderType.AmazonSes,
              message,
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
          cc: unsplitCc,
          bcc: unsplitBcc,
          subject,
          headers,
          replyTo,
          name: emailName,
          provider: {
            type: EmailProviderType.AmazonSes,
          },
        },
      });
    }

    case EmailProviderType.Gmail: {
      if (!emailProvider.accessToken) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: "Failed to get or refresh Gmail access token",
          },
        });
      }

      const gmailAttachments: SendGmailEmailParams["attachments"] =
        attachments?.map((attachment) => ({
          filename: attachment.name,
          content: attachment.data,
          contentType: attachment.mimeType,
        }));

      const gmailResult = await sendGmailEmail({
        accessToken: emailProvider.accessToken,
        params: {
          to,
          from,
          subject,
          bodyHtml: body,
          replyTo,
          cc,
          bcc,
          headers,
          attachments: gmailAttachments,
        },
      });

      if (gmailResult.isErr()) {
        return err({
          type: InternalEventType.MessageFailure,
          variant: {
            type: ChannelType.Email,
            provider: gmailResult.error,
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
          cc: unsplitCc,
          bcc: unsplitBcc,
          name: emailName,
          attachments: attachmentsSent,
          provider: {
            type: EmailProviderType.Gmail,
            messageId: gmailResult.value.messageId,
            threadId: gmailResult.value.threadId,
          },
        },
      });
    }

    case EmailProviderType.Resend: {
      const resendAttachments: ResendRequiredData["attachments"] =
        attachments?.map((attachment) => ({
          filename: attachment.name,
          content: attachment.data,
        }));
      const fromWithName = emailName ? `${emailName} <${from}>` : from;
      const mailData: ResendRequiredData = {
        to,
        from: fromWithName,
        subject,
        html: body,
        reply_to: replyTo,
        headers,
        cc,
        bcc,
        tags: messageTags
          ? Object.entries(messageTags).map(([name, value]) => ({
              name,
              value,
            }))
          : [],
        attachments: resendAttachments,
      };

      if (!emailProvider.apiKey) {
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
        apiKey: emailProvider.apiKey,
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
          name: emailName,
          body,
          to,
          cc: unsplitCc,
          bcc: unsplitBcc,
          headers,
          subject,
          replyTo,
          attachments: attachmentsSent,
          provider: {
            type: EmailProviderType.Resend,
          },
        },
      });
    }
    case EmailProviderType.PostMark: {
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
      const fromWithName = emailName ? `${emailName} <${from}>` : from;
      const mailData: PostMarkRequiredFields = {
        To: to,
        From: fromWithName,
        Subject: subject,
        HtmlBody: body,
        ReplyTo: replyTo,
        Cc: unsplitCc,
        Bcc: unsplitBcc,
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

      if (!emailProvider.apiKey) {
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
        apiKey: emailProvider.apiKey,
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
          name: emailName,
          body,
          to,
          subject,
          replyTo,
          headers,
          cc: unsplitCc,
          bcc: unsplitBcc,
          attachments: attachmentsSent,
          provider: {
            type: EmailProviderType.PostMark,
          },
        },
      });
    }

    case EmailProviderType.MailChimp: {
      // Mandatory for Mailchimp
      const website = getWebsiteFromFromEmail(from) ?? "https://dittofeed.com";
      let mailChimpTo: MailChimpMessage["to"] = [{ email: to }];
      if (cc && cc.length > 0) {
        mailChimpTo = mailChimpTo.concat(
          cc.map((email) => ({ email, type: "cc" })),
        );
      }
      if (bcc && bcc.length > 0) {
        mailChimpTo = mailChimpTo.concat(
          bcc.map((email) => ({ email, type: "bcc" })),
        );
      }
      if (replyTo) {
        headers["Reply-To"] = replyTo;
      }
      const metadata: { website: string } & Record<string, string> = {
        website,
      };
      if (messageTags) {
        if (messageTags.workspaceId) {
          metadata.workspaceId = messageTags.workspaceId;
        }
        if (messageTags.userId) {
          metadata.userId = messageTags.userId;
        }
        metadata.messageId = messageTags.messageId;
      }

      const mailData: MailChimpMessage = {
        html: body,
        text: body,
        from_name: emailName,
        preserve_recipients: true,
        subject,
        headers,
        to: mailChimpTo,
        attachments: attachments?.map(({ name, data, mimeType }) => ({
          type: mimeType,
          name,
          content: data,
        })),
        from_email: from,
        metadata,
      };

      if (!emailProvider.apiKey) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `missing apiKey in MailChimp secret config`,
          },
        });
      }

      const result = await sendMailMailchimp({
        apiKey: emailProvider.apiKey,
        message: mailData,
      });

      if (result.isErr()) {
        let name: string;
        let message: string;
        if (result.error instanceof AxiosError) {
          name = result.error.code?.toString() ?? "Unknown";
          message = result.error.message;
        } else {
          name = result.error.status;
          message = result.error.reject_reason;
        }
        return err({
          type: InternalEventType.MessageFailure,
          variant: {
            type: ChannelType.Email,
            provider: {
              type: EmailProviderType.MailChimp,
              name,
              message,
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
          name: emailName,
          to,
          subject,
          cc: unsplitCc,
          bcc: unsplitBcc,
          replyTo,
          headers,
          attachments: attachmentsSent,
          provider: {
            type: EmailProviderType.MailChimp,
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
          attachments: attachmentsSent,
          cc: unsplitCc,
          bcc: unsplitBcc,
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

export async function sendSms(
  params: Omit<SendMessageParametersSms, "channel">,
): Promise<BackendMessageSendResult> {
  const {
    workspaceId,
    templateId,
    userPropertyAssignments,
    subscriptionGroupDetails,
    useDraft,
    providerOverride,
    userId,
    messageTags,
    disableCallback = false,
  } = params;
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
      // Provider override has to be nullable to be compatible with JSON schema
      providerOverride: providerOverride ?? undefined,
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
      const configResult = schemaValidateWithErr(
        parsedConfigResult.value,
        TwilioSecret,
      );
      if (configResult.isErr()) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: configResult.error.message,
          },
        });
      }

      const {
        accountSid,
        authToken,
        messagingServiceSid,
        apiKeySid,
        apiKeySecret,
      } = configResult.value;

      if (!accountSid) {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message: `missing accountSid in sms provider config`,
          },
        });
      }
      let auth: TwilioAuth;
      if (apiKeySid && apiKeySecret) {
        auth = {
          type: "apiKey",
          apiKeySid,
          apiKeySecret,
        };
      } else if (authToken) {
        auth = {
          type: "authToken",
          authToken,
        };
      } else {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message:
              "twilio auth must provider either an auth token or api key sid and secret",
          },
        });
      }

      let sender: TwilioSender;
      const { senderOverride } = params;
      if (providerOverride === SmsProviderType.Twilio && senderOverride) {
        switch (senderOverride.type) {
          case TwilioSenderOverrideType.MessageSid:
            sender = {
              messagingServiceSid: senderOverride.messagingServiceSid,
            };
            break;
          case TwilioSenderOverrideType.PhoneNumber:
            sender = {
              from: senderOverride.phone,
            };
            break;
          default:
            assertUnreachable(senderOverride);
        }
      } else if (messagingServiceSid) {
        sender = {
          messagingServiceSid,
        };
      } else {
        return err({
          type: InternalEventType.BadWorkspaceConfiguration,
          variant: {
            type: BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
            message:
              "twilio sender must provide either a messaging service sid or a sender override",
          },
        });
      }

      const result = await sendSmsTwilio({
        body,
        accountSid,
        auth,
        userId,
        subscriptionGroupId: subscriptionGroupDetails?.id,
        to,
        workspaceId,
        disableCallback,
        tags: messageTags,
        ...sender,
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
    db().query.secret.findFirst({
      where: and(
        eq(dbSecret.workspaceId, workspaceId),
        eq(dbSecret.name, SecretNames.Webhook),
      ),
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

/**
 * Send a message to a channel
 * Re-tryable errors will be thrown. Non-retryable errors will be returned as
 * error objects.
 * @param params - The parameters for the message
 * @returns The result of the message send
 */
export async function sendMessage(
  params: SendMessageParameters,
): Promise<BackendMessageSendResult> {
  return withSpan({ name: "sendMessage" }, async (span) => {
    span.setAttributes({
      channel: params.channel,
      workspaceId: params.workspaceId,
      templateId: params.templateId,
      journeyId: params.messageTags?.journeyId,
      messageId: params.messageTags?.messageId,
      nodeId: params.messageTags?.nodeId,
    });
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
  });
}
