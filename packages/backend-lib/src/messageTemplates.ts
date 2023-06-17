import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";

import prisma from "./prisma";
import {
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  TemplateResourceType,
} from "./types";

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
    messageTemplates.map(({ id, name, definition }) => ({
      id,
      name,
      workspaceId,
      definition: unwrap(
        schemaValidate(definition, MessageTemplateResourceDefinition)
      ),
    }));
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
