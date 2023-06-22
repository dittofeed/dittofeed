import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import prisma from "./prisma";
import {
  EmailTemplate,
  MessageTemplate,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  TemplateResourceType,
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
}: EmailTemplate): MessageTemplateResource {
  return {
    id,
    name,
    workspaceId,
    definition: {
      type: TemplateResourceType.Email,
      subject,
      from,
      body,
    },
  };
}

export async function findMessageTemplate({
  id,
  isEmail,
}: {
  id: string;
  isEmail: boolean;
}): Promise<Result<MessageTemplateResource | null, Error>> {
  // TODO delete post consolidation
  if (isEmail) {
    const emailTemplate = await prisma().emailTemplate.findUnique({
      where: {
        id,
      },
    });
    if (!emailTemplate) {
      return ok(null);
    }
    return ok(enrichEmailTemplate(emailTemplate));
  }
  const template = await prisma().messageTemplate.findUnique({
    where: {
      id,
    },
  });
  if (!template) {
    return ok(null);
  }

  return enrichMessageTemplate(template);
}

export async function upsertMessageTemplate(
  data: UpsertMessageTemplateResource
): Promise<MessageTemplateResource> {
  if (data.definition.type === TemplateResourceType.Email) {
    let emailTemplate: EmailTemplate;
    if (data.workspaceId && data.name) {
      emailTemplate = await prisma().emailTemplate.upsert({
        where: {
          id: data.id,
        },
        create: {
          workspaceId: data.workspaceId,
          name: data.name,
          id: data.id,
          from: data.definition.from,
          subject: data.definition.subject,
          body: data.definition.body,
        },
        update: {
          workspaceId: data.workspaceId,
          name: data.name,
          id: data.id,
          from: data.definition.from,
          subject: data.definition.subject,
          body: data.definition.body,
        },
      });
    } else {
      emailTemplate = await prisma().emailTemplate.update({
        where: {
          id: data.id,
        },
        data: {
          workspaceId: data.workspaceId,
          name: data.name,
          id: data.id,
          from: data.definition.from,
          subject: data.definition.subject,
          body: data.definition.body,
        },
      });
    }

    return enrichEmailTemplate(emailTemplate);
  }
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
}: {
  workspaceId: string;
}): Promise<MessageTemplateResource[]> {
  // TODO consolidate template models
  const [messageTemplates, emailTemplates] = await Promise.all([
    prisma().messageTemplate.findMany({
      where: {
        workspaceId,
      },
    }),
    prisma().emailTemplate.findMany({
      where: {
        workspaceId,
      },
    }),
  ]);
  const genericMessageTemplates: MessageTemplateResource[] =
    messageTemplates.map((mt) => unwrap(enrichMessageTemplate(mt)));

  const emailMessageTemplates: MessageTemplateResource[] = emailTemplates.map(
    (et) => enrichEmailTemplate(et)
  );
  return genericMessageTemplates.concat(emailMessageTemplates);
}
