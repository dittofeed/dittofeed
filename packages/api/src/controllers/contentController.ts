import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { renderLiquid } from "backend-lib/src/liquid";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import { EmailTemplate, Prisma } from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import { SUBSCRIPTION_SECRET_NAME } from "isomorphic-lib/src/constants";
import {
  DeleteMessageTemplateRequest,
  EmailTemplateResource,
  EmptyResponse,
  JsonResultType,
  MessageTemplateResource,
  RenderMessageTemplateRequest,
  RenderMessageTemplateResponse,
  RenderMessageTemplateResponseContent,
  TemplateResourceType,
  UpsertMessageTemplateResource,
} from "isomorphic-lib/src/types";
import * as R from "remeda";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function contentController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/templates/render",
    {
      schema: {
        description: "Render message template.",
        body: RenderMessageTemplateRequest,
        response: {
          200: RenderMessageTemplateResponse,
        },
      },
    },
    async (request, reply) => {
      const {
        contents,
        workspaceId,
        subscriptionGroupId,
        channel: channelName,
        userProperties,
      } = request.body;

      const [channel, secrets] = await Promise.all([
        prisma().channel.findUnique({
          where: {
            workspaceId_name: {
              name: channelName,
              workspaceId,
            },
          },
        }),
        prisma().secret.findMany({
          where: {
            workspaceId,
            name: {
              in: [SUBSCRIPTION_SECRET_NAME],
            },
          },
        }),
      ]);

      const templateSecrets = R.mapToObj(secrets, (secret) => [
        secret.name,
        secret.value,
      ]);

      let responseContents: RenderMessageTemplateResponse["contents"] = {};

      if (channel) {
        responseContents = R.mapValues(contents, (content) => {
          let value: RenderMessageTemplateResponseContent;
          try {
            const rendered = renderLiquid({
              workspaceId,
              template: content.value,
              mjml: content.mjml,
              subscriptionGroupId,
              userProperties,
              identifierKey: channel.identifier,
              secrets: templateSecrets,
            });
            value = {
              type: JsonResultType.Ok,
              value: rendered,
            };
          } catch (e) {
            const err = e as Error;
            value = {
              type: JsonResultType.Err,
              err: err.message,
            };
          }
          return value;
        });
      }

      return reply.status(200).send({
        contents: responseContents,
      });
    }
  );

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
          204: EmptyResponse,
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
