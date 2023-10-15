import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import prisma from "./prisma";
import {
  ChannelType,
  EmailTemplate,
  MessageTemplate,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  UpsertMessageTemplateResource,
} from "./types";

export function enrichMessageTemplate({
  id,
  name,
  workspaceId,
  definition,
}: MessageTemplate): Result<MessageTemplateResource, Error> {
  const enrichedDefintion = schemaValidateWithErr(
    definition,
    MessageTemplateResourceDefinition
  );
  if (enrichedDefintion.isErr()) {
    return err(enrichedDefintion.error);
  }

  return ok({
    id,
    name,
    workspaceId,
    definition: enrichedDefintion.value,
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

  return enrichMessageTemplate(template).map((t) =>
    t.definition.type === channel ? t : null
  );
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
      },
      update: {
        workspaceId: data.workspaceId,
        name: data.name,
        id: data.id,
        definition: data.definition,
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
