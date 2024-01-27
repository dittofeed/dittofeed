/* eslint-disable arrow-body-style */
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { createWriteKey, getWriteKeys } from "backend-lib/src/auth";
import prisma from "backend-lib/src/prisma";
import { upsertSmsProvider } from "backend-lib/src/smsProviders";
import { Prisma } from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import {
  DataSourceConfigurationResource,
  DataSourceVariantType,
  DefaultEmailProviderResource,
  DeleteWriteKeyResource,
  EmptyResponse,
  ListWriteKeyRequest,
  ListWriteKeyResource,
  SmsProviderConfig,
  UpsertDataSourceConfigurationResource,
  UpsertSmsProviderRequest,
  UpsertWriteKeyResource,
  WriteKeyResource,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function settingsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/data-sources",
    {
      schema: {
        description: "Create or update email provider settings",
        tags: ["Settings"],
        body: UpsertDataSourceConfigurationResource,
        response: {
          200: DataSourceConfigurationResource,
          400: Type.Object({
            error: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, variant } = request.body;

      let resource: DataSourceConfigurationResource;
      switch (variant.type) {
        case DataSourceVariantType.SegmentIO: {
          if (!variant.sharedSecret) {
            return reply.status(400).send({
              error:
                "Invalid payload. Segment variant musti included sharedSecret value.",
            });
          }
          const { id } = await prisma().segmentIOConfiguration.upsert({
            where: {
              workspaceId,
            },
            create: {
              workspaceId,
              sharedSecret: variant.sharedSecret,
            },
            update: {
              sharedSecret: variant.sharedSecret,
            },
          });

          resource = {
            id,
            workspaceId,
            variant: {
              type: variant.type,
              sharedSecret: variant.sharedSecret,
            },
          };
        }
      }

      return reply.status(200).send(resource);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/sms-providers",
    {
      schema: {
        description: "Create or update sms provider settings",
        tags: ["Settings"],
        body: UpsertSmsProviderRequest,
        response: {
          200: SmsProviderConfig,
        },
      },
    },
    async (request, reply) => {
      const resource = await upsertSmsProvider(request.body);
      return reply.status(200).send(resource);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/email-providers/default",
    {
      schema: {
        description: "Create or update email provider default",
        tags: ["Settings"],
        body: DefaultEmailProviderResource,
        response: {
          201: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, emailProviderId, fromAddress } = request.body;

      await prisma().defaultEmailProvider.upsert({
        where: {
          workspaceId,
        },
        create: {
          workspaceId,
          emailProviderId,
          fromAddress,
        },
        update: {
          emailProviderId,
          fromAddress,
        },
      });

      return reply.status(201).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/write-keys",
    {
      schema: {
        description: "Create a write key.",
        tags: ["Settings"],
        body: UpsertWriteKeyResource,
        response: {
          200: WriteKeyResource,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, writeKeyName, writeKeyValue } = request.body;

      await createWriteKey({
        workspaceId,
        writeKeyName,
        writeKeyValue,
      });
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/write-keys",
    {
      schema: {
        description: "Get write keys.",
        tags: ["Settings"],
        querystring: ListWriteKeyRequest,
        response: {
          200: ListWriteKeyResource,
        },
      },
    },
    async (request, reply) => {
      const resource = await getWriteKeys({
        workspaceId: request.query.workspaceId,
      });
      return reply.status(200).send(resource);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/write-keys",
    {
      schema: {
        description: "Delete a write key.",
        tags: ["Settings"],
        body: DeleteWriteKeyResource,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        await prisma().secret.delete({
          where: {
            workspaceId_name: {
              workspaceId: request.body.workspaceId,
              name: request.body.writeKeyName,
            },
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          if (e.code === "P2025") {
            return reply.status(204).send();
          }
        } else {
          throw e;
        }
      }

      return reply.status(204).send();
    },
  );
}
