import { db, insert } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { enrichMessageTemplate } from "backend-lib/src/messaging";
import {
  CompletionStatus,
  DefaultEmailProviderResource,
  EmailContentsType,
  EmailTemplateResource,
  MessageTemplate,
} from "backend-lib/src/types";
import { toUserPropertyResource } from "backend-lib/src/userProperties";
import { and, eq } from "drizzle-orm";
import { defaultEmailDefinition } from "isomorphic-lib/src/email";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { defaultSmsDefinition } from "isomorphic-lib/src/sms";
import { DEFAULT_WEBHOOK_DEFINITION } from "isomorphic-lib/src/webhook";

import { AppState } from "./types";

export async function serveSmsTemplate({
  workspaceId,
  messageTemplateId,
  defaultName,
}: {
  workspaceId: string;
  messageTemplateId: string;
  defaultName?: string;
}): Promise<Pick<AppState, "messages" | "userProperties">> {
  const [smsTemplate, userProperties] = await Promise.all([
    db().query.messageTemplate.findFirst({
      where: and(
        eq(schema.messageTemplate.id, messageTemplateId),
        eq(schema.messageTemplate.workspaceId, workspaceId),
      ),
    }),
    db().query.userProperty.findMany({
      where: eq(schema.userProperty.workspaceId, workspaceId),
    }),
  ]);

  let smsTemplateWithDefault: MessageTemplate;
  if (!smsTemplate) {
    smsTemplateWithDefault = await insert({
      table: schema.messageTemplate,
      values: {
        workspaceId,
        name: defaultName ?? `New SMS Message - ${messageTemplateId}`,
        id: messageTemplateId,
        definition: defaultSmsDefinition(),
      },
      lookupExisting: and(
        eq(schema.messageTemplate.id, messageTemplateId),
        eq(schema.messageTemplate.workspaceId, workspaceId),
      )!,
      doNothingOnConflict: true,
    }).then(unwrap);
  } else {
    smsTemplateWithDefault = smsTemplate;
  }

  return {
    messages: {
      type: CompletionStatus.Successful,
      value: [unwrap(enrichMessageTemplate(smsTemplateWithDefault))],
    },
    userProperties: {
      type: CompletionStatus.Successful,
      value: userProperties.flatMap((p) => unwrap(toUserPropertyResource(p))),
    },
  };
}

export async function serveEmailTemplate({
  workspaceId,
  messageTemplateId,
  emailContentsType,
  defaultName,
}: {
  workspaceId: string;
  messageTemplateId: string;
  emailContentsType: EmailContentsType;
  defaultName?: string;
}): Promise<Pick<AppState, "messages" | "userProperties">> {
  const [emailTemplate, userProperties, defaultEmailProvider] =
    await Promise.all([
      db().query.messageTemplate.findFirst({
        where: and(
          eq(schema.messageTemplate.id, messageTemplateId),
          eq(schema.messageTemplate.workspaceId, workspaceId),
        ),
      }),
      db().query.userProperty.findMany({
        where: eq(schema.userProperty.workspaceId, workspaceId),
      }),
      db().query.defaultEmailProvider.findFirst({
        where: eq(schema.defaultEmailProvider.workspaceId, workspaceId),
      }),
    ]);

  let emailTemplateWithDefault: MessageTemplate;
  if (!emailTemplate) {
    emailTemplateWithDefault = await insert({
      table: schema.messageTemplate,
      doNothingOnConflict: true,
      lookupExisting: and(
        eq(schema.messageTemplate.id, messageTemplateId),
        eq(schema.messageTemplate.workspaceId, workspaceId),
      )!,
      values: {
        workspaceId,
        name: defaultName ?? `New Email Message - ${messageTemplateId}`,
        id: messageTemplateId,
        definition: defaultEmailDefinition({
          emailContentsType,
          emailProvider: defaultEmailProvider as
            | DefaultEmailProviderResource
            | undefined,
        }) satisfies EmailTemplateResource,
      },
    }).then(unwrap);
  } else {
    emailTemplateWithDefault = emailTemplate;
  }
  return {
    messages: {
      type: CompletionStatus.Successful,
      value: [unwrap(enrichMessageTemplate(emailTemplateWithDefault))],
    },
    userProperties: {
      type: CompletionStatus.Successful,
      value: userProperties.flatMap((p) => unwrap(toUserPropertyResource(p))),
    },
  };
}

export async function serveWebhookTemplate({
  workspaceId,
  messageTemplateId,
  defaultName,
}: {
  workspaceId: string;
  messageTemplateId: string;
  defaultName?: string;
}): Promise<Pick<AppState, "messages" | "userProperties">> {
  const [template, userProperties] = await Promise.all([
    db().query.messageTemplate.findFirst({
      where: and(
        eq(schema.messageTemplate.id, messageTemplateId),
        eq(schema.messageTemplate.workspaceId, workspaceId),
      ),
    }),
    db().query.userProperty.findMany({
      where: eq(schema.userProperty.workspaceId, workspaceId),
    }),
  ]);
  let templateWithDefault: MessageTemplate;
  if (!template) {
    templateWithDefault = await insert({
      table: schema.messageTemplate,
      lookupExisting: and(
        eq(schema.messageTemplate.id, messageTemplateId),
        eq(schema.messageTemplate.workspaceId, workspaceId),
      )!,
      values: {
        workspaceId,
        name: defaultName ?? `New Webhook Template - ${messageTemplateId}`,
        id: messageTemplateId,
        definition: DEFAULT_WEBHOOK_DEFINITION,
      },
      doNothingOnConflict: true,
    }).then(unwrap);
  } else {
    templateWithDefault = template;
  }

  return {
    messages: {
      type: CompletionStatus.Successful,
      value: [unwrap(enrichMessageTemplate(templateWithDefault))],
    },
    userProperties: {
      type: CompletionStatus.Successful,
      value: userProperties.flatMap((p) => unwrap(toUserPropertyResource(p))),
    },
  };
}
