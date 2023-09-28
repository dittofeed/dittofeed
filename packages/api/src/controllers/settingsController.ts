/* eslint-disable arrow-body-style */
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { createWriteKey, getWriteKeys } from "backend-lib/src/auth";
import prisma from "backend-lib/src/prisma";
import { upsertSmsProvider } from "backend-lib/src/smsProviders";
import { EmailProvider, Prisma } from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import {
  DataSourceConfigurationResource,
  DataSourceVariantType,
  DeleteWriteKeyResource,
  EmailProviderResource,
  EmailProviderType,
  EmptyResponse,
  ListWriteKeyRequest,
  ListWriteKeyResource,
  SmsProviderConfig,
  UpsertDataSourceConfigurationResource,
  UpsertEmailProviderResource,
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
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/sms-providers",
    {
      schema: {
        description: "Create or update sms provider settings",
        body: UpsertSmsProviderRequest,
        response: {
          200: SmsProviderConfig,
        },
      },
    },
    async (request, reply) => {
      const resource = await upsertSmsProvider(request.body);
      return reply.status(200).send(resource);
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/email-providers",
    {
      schema: {
        description: "Create or update email provider settings",
        body: UpsertEmailProviderResource,
        response: {
          200: EmailProviderResource,
        },
      },
    },
    async (request, reply) => {
      let emailProvider: EmailProvider;
      const { id, workspaceId, type, apiKey } = request.body;
      const canCreate = workspaceId && type && apiKey;

      if (workspaceId && type) {
        if (canCreate) {
          emailProvider = await prisma().emailProvider.upsert({
            where: {
              workspaceId_type: {
                workspaceId,
                type,
              },
            },
            create: {
              id,
              workspaceId,
              type,
              apiKey,
            },
            update: {
              workspaceId,
              type,
              apiKey,
            },
          });
        } else {
          emailProvider = await prisma().emailProvider.update({
            where: {
              workspaceId_type: {
                workspaceId,
                type,
              },
            },
            data: {
              id,
              workspaceId,
              type,
              apiKey,
            },
          });
        }
      } else if (id) {
        emailProvider = await prisma().emailProvider.update({
          where: {
            id,
          },
          data: {
            id,
            workspaceId,
            type,
            apiKey,
          },
        });
      } else {
        return reply.status(400).send();
      }

      await prisma().defaultEmailProvider.upsert({
        where: {
          workspaceId,
        },
        create: {
          workspaceId,
          emailProviderId: emailProvider.id,
        },
        update: {},
      });

      let recordType: EmailProviderType;
      switch (emailProvider.type) {
        case EmailProviderType.Sendgrid:
          recordType = EmailProviderType.Sendgrid;
          break;
        default:
          throw new Error(
            `unknown email provider record type ${emailProvider.type}`
          );
      }
      const resource: EmailProviderResource = {
        id: emailProvider.id,
        type: recordType,
        apiKey: emailProvider.apiKey,
        workspaceId: emailProvider.workspaceId,
      };
      return reply.status(200).send(resource);
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/write-keys",
    {
      schema: {
        description: "Create a write key.",
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
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/write-keys",
    {
      schema: {
        description: "Get write keys.",
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
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/write-keys",
    {
      schema: {
        description: "Delete a write key.",
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
    }
  );
}
