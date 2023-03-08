import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import prisma from "backend-lib/src/prisma";
import { EmailTemplate } from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import {
  EmailTemplateResource,
  MessageTemplateResource,
  TemplateResourceType,
  UpsertMessageTemplateResource,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function contentController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/messages",
    {
      schema: {
        description: "Create or update email provider settings",
        body: UpsertMessageTemplateResource,
        response: {
          200: MessageTemplateResource,
        },
      },
    },
    async (request, reply) => {
      let emailTemplate: EmailTemplate;
      const { id, workspaceId, from, subject, body, name } = request.body;
      const canCreate = workspaceId && from && subject && body && name;

      if (canCreate && id) {
        emailTemplate = await prisma().emailTemplate.upsert({
          where: {
            id,
          },
          create: {
            id,
            workspaceId,
            from,
            name,
            subject,
            body,
          },
          update: {
            workspaceId,
            name,
            from,
            subject,
            body,
          },
        });
      } else {
        emailTemplate = await prisma().emailTemplate.update({
          where: {
            id,
          },
          data: {
            workspaceId,
            name,
            from,
            subject,
            body,
          },
        });
      }

      const resource: EmailTemplateResource = {
        type: TemplateResourceType.Email,
        id: emailTemplate.id,
        from: emailTemplate.from,
        name: emailTemplate.name,
        subject: emailTemplate.subject,
        body: emailTemplate.body,
        workspaceId: emailTemplate.workspaceId,
      };
      return reply.status(200).send(resource);
    }
  );
}
