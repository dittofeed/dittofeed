import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { renderLiquid } from "backend-lib/src/liquid";
import { upsertMessageTemplate } from "backend-lib/src/messageTemplates";
import prisma from "backend-lib/src/prisma";
import { Prisma } from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import { SUBSCRIPTION_SECRET_NAME } from "isomorphic-lib/src/constants";
import {
  ChannelType,
  DeleteMessageTemplateRequest,
  EmptyResponse,
  JsonResultType,
  MessageTemplateResource,
  RenderMessageTemplateRequest,
  RenderMessageTemplateResponse,
  RenderMessageTemplateResponseContent,
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
        channel,
        userProperties,
      } = request.body;

      const secrets = await prisma().secret.findMany({
        where: {
          workspaceId,
          name: {
            in: [SUBSCRIPTION_SECRET_NAME],
          },
        },
      });

      const templateSecrets = R.mapToObj(secrets, (secret) => [
        secret.name,
        secret.value,
      ]);

      const identifierKey = CHANNEL_IDENTIFIERS[channel];

      const responseContents: RenderMessageTemplateResponse["contents"] =
        R.mapValues(contents, (content) => {
          let value: RenderMessageTemplateResponseContent;
          try {
            const rendered = renderLiquid({
              workspaceId,
              template: content.value,
              mjml: content.mjml,
              subscriptionGroupId,
              userProperties,
              identifierKey,
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
      const resource = await upsertMessageTemplate(request.body);
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
          case ChannelType.Email: {
            await prisma().emailTemplate.delete({
              where: {
                id,
              },
            });
            break;
          }
          default: {
            await prisma().messageTemplate.delete({
              where: {
                id,
              },
            });
            break;
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
