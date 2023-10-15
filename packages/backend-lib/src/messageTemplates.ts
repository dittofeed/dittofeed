import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import prisma from "./prisma";
import {
  ChannelType,
  EmailTemplate,
  MessageSendResult,
  MessageTemplate,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  SubscriptionChange,
  SubscriptionGroupType,
  UpsertMessageTemplateResource,
  UserSubscriptionAction,
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

export async function sendMessage({
  workspaceId,
  templateId,
  channel,
  userPropertyAssignments,
  subscriptionGroupAction,
  subscriptionGroupType,
}: {
  workspaceId: string;
  templateId: string;
  userPropertyAssignments: UserPropertyAssignments;
  channel: ChannelType;
  subscriptionGroupAction: UserSubscriptionAction;
  subscriptionGroupType: SubscriptionGroupType;
}): Promise<MessageSendResult> {}
