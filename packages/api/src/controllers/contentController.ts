import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import { EmailTemplate, Prisma } from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import {
  DeleteMessageTemplateRequest,
  DeleteMessageTemplateResponse,
  EmailTemplateResource,
  MessageTemplateResource,
  TemplateResourceType,
  UpsertMessageTemplateResource,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function contentController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/templates",
    {
      schema: {
        description: "Create or update message template",
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

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/templates",
    {
      schema: {
        description: "Delete a message template.",
        body: DeleteMessageTemplateRequest,
        response: {
          204: DeleteMessageTemplateResponse,
          404: {},
        },
      },
    },
    async (request, reply) => {
      const { id, type } = request.body;

      try {
        switch (type) {
          case TemplateResourceType.Email: {
            await prisma().emailTemplate.delete({
              where: {
                id,
              },
            });
            break;
          }
          default: {
            logger().error(
              {
                type,
              },
              "Unhandled message template type."
            );
            const response = await reply.status(500).send();
            return response;
          }
        }
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          switch (e.code) {
            case "P2025":
              return reply.status(404).send();
            case "P2023":
              return reply.status(404).send();
          }
        }
        throw e;
      }

      return reply.status(204).send();
    }
  );
}
