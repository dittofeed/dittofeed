import { Type, TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import prisma from "backend-lib/src/prisma";
import { Prisma } from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import { isObject } from "isomorphic-lib/src/objects";
import {
  DeleteSecretRequest,
  EmptyResponse,
  JSONValue,
  ListSecretsRequest,
  SecretResource,
  UpsertSecretRequest,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function secretsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "List secrets.",
        querystring: ListSecretsRequest,
        tags: ["Secrets"],
        response: {
          200: Type.Array(SecretResource),
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, names } = request.query;

      const where: Prisma.SecretFindManyArgs["where"] = {
        workspaceId,
      };
      if (names?.length) {
        where.name = {
          in: names,
        };
      }

      const secrets = (await prisma().secret.findMany({ where })).flatMap(
        (secret) => {
          if (!secret.value) {
            return [];
          }
          return {
            workspaceId: secret.workspaceId,
            name: secret.name,
            value: secret.value,
          };
        },
      );
      return reply.status(200).send(secrets);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description:
          "Create or update a secret. Will patch the secret definition if passed.",
        tags: ["Secrets"],
        body: UpsertSecretRequest,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, name, value, configValue } = request.body;
      await prisma().$transaction(async (pTx) => {
        const secret = await pTx.secret.findUnique({
          where: {
            workspaceId_name: {
              workspaceId,
              name,
            },
          },
        });
        const existingConfigValue = isObject(secret?.configValue)
          ? secret?.configValue
          : undefined;

        let newConfig: Record<string, unknown> | undefined;
        if (configValue) {
          newConfig = {
            ...existingConfigValue,
            ...configValue,
          };
        } else {
          newConfig = undefined;
        }
        const configValueToSave = newConfig as
          | Record<string, JSONValue>
          | undefined;

        await pTx.secret.upsert({
          where: {
            workspaceId_name: {
              workspaceId,
              name,
            },
          },
          create: {
            workspaceId,
            name,
            value,
            configValue: configValueToSave,
          },
          update: {
            value,
            configValue: configValueToSave,
          },
        });
      });

      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description: "Delete a secret.",
        querystring: DeleteSecretRequest,
        tags: ["Secrets"],
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, id } = request.query;
      await prisma().secret.delete({
        where: {
          workspaceId,
          id,
        },
      });
      return reply.status(204).send();
    },
  );
}
