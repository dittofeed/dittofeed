import { ValueError } from "@sinclair/typebox/errors";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  schemaValidate,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import prisma from "./prisma";
import {
  MessageTemplate,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  TemplateResourceType,
  UpsertMessageTemplateResource,
} from "./types";

// export async function upsertMessageTemplate({
//   workspaceId,
// }: {
//   workspaceId: string;
//   data: UpsertMessageTemplateResource;
// }): Promise<MessageTemplateResource> {}

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
    ({ id, name, body, subject, from }) => ({
      id,
      name,
      workspaceId,
      definition: {
        type: TemplateResourceType.Email,
        subject,
        from,
        body,
      },
    })
  );
  return genericMessageTemplates.concat(emailMessageTemplates);
}
