/* eslint-disable arrow-body-style */
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { getOrCreateWriteKey, getWriteKeys } from "backend-lib/src/auth";
import { db, upsert } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { isGmailAuthorized } from "backend-lib/src/gmail";
import { upsertEmailProvider } from "backend-lib/src/messaging/email";
import { upsertSmsProvider } from "backend-lib/src/messaging/sms";
import { getUserFromRequest } from "backend-lib/src/requestContext";
import { and, eq } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  BadRequestResponse,
  DataSourceConfigurationResource,
  DataSourceVariantType,
  DefaultEmailProviderResource,
  DefaultSmsProviderResource,
  DeleteDataSourceConfigurationRequest,
  DeleteWriteKeyResource,
  EmptyResponse,
  GetGmailAuthorizationRequest,
  GetGmailAuthorizationResponse,
  ListDataSourceConfigurationRequest,
  ListDataSourceConfigurationResponse,
  ListWriteKeyRequest,
  ListWriteKeyResource,
  PersistedSmsProvider,
  UpsertDataSourceConfigurationResource,
  UpsertDefaultEmailProviderRequest,
  UpsertEmailProviderRequest,
  UpsertSmsProviderRequest,
  UpsertWriteKeyResource,
  WriteKeyResource,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function settingsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/data-sources",
    {
      schema: {
        description: "Get data source settings",
        tags: ["Settings"],
        querystring: ListDataSourceConfigurationRequest,
        response: {
          200: ListDataSourceConfigurationResponse,
        },
      },
    },
    async (request, reply) => {
      const segmentIoConfiguration =
        await db().query.segmentIoConfiguration.findFirst({
          where: eq(
            schema.segmentIoConfiguration.workspaceId,
            request.query.workspaceId,
          ),
        });
      const existingDatasources: DataSourceVariantType[] = [];
      if (segmentIoConfiguration) {
        existingDatasources.push(DataSourceVariantType.SegmentIO);
      }
      return reply.status(200).send({
        dataSourceConfigurations: existingDatasources,
      });
    },
  );
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
          const { id } = await upsert({
            table: schema.segmentIoConfiguration,
            values: {
              workspaceId,
              sharedSecret: variant.sharedSecret,
            },
            target: [schema.segmentIoConfiguration.workspaceId],
            set: {
              sharedSecret: variant.sharedSecret,
            },
          }).then(unwrap);

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

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/data-sources",
    {
      schema: {
        description: "Delete data source settings",
        tags: ["Settings"],
        querystring: DeleteDataSourceConfigurationRequest,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, type } = request.query;
      switch (type) {
        case DataSourceVariantType.SegmentIO: {
          await db()
            .delete(schema.segmentIoConfiguration)
            .where(eq(schema.segmentIoConfiguration.workspaceId, workspaceId));
          break;
        }
      }
      return reply.status(204).send();
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

      await upsert({
        table: schema.defaultSmsProvider,
        values: {
          workspaceId,
          smsProviderId,
        },
        target: [schema.defaultSmsProvider.workspaceId],
        set: {
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
        body: UpsertEmailProviderRequest,
        response: {
          201: EmptyResponse,
          400: BadRequestResponse,
        },
      },
    },
    async (request, reply) => {
      await upsertEmailProvider(request.body);
      return reply.status(201).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/sms-providers",
    {
      schema: {
        description: "Create or update sms provider",
        tags: ["Settings"],
        body: UpsertSmsProviderRequest,
        response: {
          201: EmptyResponse,
          400: BadRequestResponse,
        },
      },
    },
    async (request, reply) => {
      await upsertSmsProvider(request.body);
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
        const emailProvider = await db().query.emailProvider.findFirst({
          where: and(
            eq(schema.emailProvider.workspaceId, workspaceId),
            eq(schema.emailProvider.type, request.body.emailProvider),
          ),
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

      await upsert({
        table: schema.defaultEmailProvider,
        values: resource,
        target: [schema.defaultEmailProvider.workspaceId],
        set: resource,
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
      const { workspaceId, writeKeyName } = request.body;
      const result = await db()
        .delete(schema.secret)
        .where(
          and(
            eq(schema.secret.workspaceId, workspaceId),
            eq(schema.secret.name, writeKeyName),
          ),
        )
        .returning();
      if (!result.length) {
        return reply.status(404).send();
      }
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/gmail-authorization",
    {
      schema: {
        description: "Get gmail authorization status",
        tags: ["Settings"],
        querystring: GetGmailAuthorizationRequest,
        response: {
          200: GetGmailAuthorizationResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.query;
      const { workspaceOccupantId } = getUserFromRequest(request);
      const authorized = await isGmailAuthorized({
        workspaceId,
        workspaceOccupantId,
      });
      return reply.status(200).send({ authorized });
    },
  );
}
