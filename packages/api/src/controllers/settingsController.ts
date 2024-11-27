/* eslint-disable arrow-body-style */
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { getOrCreateWriteKey, getWriteKeys } from "backend-lib/src/auth";
import prisma from "backend-lib/src/prisma";
import { Prisma } from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import {
  BadRequestResponse,
  DataSourceConfigurationResource,
  DataSourceVariantType,
  DefaultEmailProviderResource,
  DefaultSmsProviderResource,
  DeleteWriteKeyResource,
  EmptyResponse,
  ListWriteKeyRequest,
  ListWriteKeyResource,
  PersistedSmsProvider,
  UpsertDataSourceConfigurationResource,
  UpsertDefaultEmailProviderRequest,
  UpsertWriteKeyResource,
  WriteKeyResource,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function settingsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/data-sources",
    {
      schema: {
        description: "Create or update data source settings",
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
    "/sms-providers/default",
    {
      schema: {
        description: "Create or update default email provider settings",
        tags: ["Settings"],
        body: DefaultSmsProviderResource,
        response: {
          200: PersistedSmsProvider,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, smsProviderId } = request.body;

      await prisma().defaultSmsProvider.upsert({
        where: {
          workspaceId,
        },
        create: {
          workspaceId,
          smsProviderId,
        },
        update: {
          smsProviderId,
        },
      });

      return reply.status(201).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/email-providers",
    {
      schema: {
        description: "Create or update email provider",
        tags: ["Settings"],
        body: UpsertDefaultEmailProviderRequest,
        response: {
          201: EmptyResponse,
          400: BadRequestResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, fromAddress } = request.body;
      let resource: DefaultEmailProviderResource;
      if ("emailProviderId" in request.body) {
        resource = request.body;
      } else {
        const emailProvider = await prisma().emailProvider.findUnique({
          where: {
            workspaceId_type: {
              workspaceId,
              type: request.body.emailProvider,
            },
          },
        });
        if (!emailProvider) {
          return reply.status(400).send({
            message: "Invalid payload. Email provider not found.",
          });
        }
        resource = {
          workspaceId,
          emailProviderId: emailProvider.id,
          fromAddress,
        };
      }

      await prisma().defaultEmailProvider.upsert({
        where: {
          workspaceId,
        },
        create: resource,
        update: resource,
      });

      return reply.status(201).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/email-providers/default",
    {
      schema: {
        description: "Create or update email provider default",
        tags: ["Settings"],
        body: UpsertDefaultEmailProviderRequest,
        response: {
          201: EmptyResponse,
          400: BadRequestResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, fromAddress } = request.body;
      let resource: DefaultEmailProviderResource;
      if ("emailProviderId" in request.body) {
        resource = request.body;
      } else {
        const emailProvider = await prisma().emailProvider.findUnique({
          where: {
            workspaceId_type: {
              workspaceId,
              type: request.body.emailProvider,
            },
          },
        });
        if (!emailProvider) {
          return reply.status(400).send({
            message: "Invalid payload. Email provider not found.",
          });
        }
        resource = {
          workspaceId,
          emailProviderId: emailProvider.id,
          fromAddress,
        };
      }

      await prisma().defaultEmailProvider.upsert({
        where: {
          workspaceId,
        },
        create: resource,
        update: resource,
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
      const { workspaceId, writeKeyName } = request.body;

      await getOrCreateWriteKey({
        workspaceId,
        writeKeyName,
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
