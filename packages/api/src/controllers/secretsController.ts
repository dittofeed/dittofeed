import { Type, TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { db, upsert } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import {
  deletePlainTextSecret,
  getPlainTextSecretAvailablity,
  upsertPlainTextSecret,
} from "backend-lib/src/secrets";
import { and, eq, inArray, SQL } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { isObject } from "isomorphic-lib/src/objects";
import {
  DeleteSecretRequest,
  DeleteSecretV2Request,
  EmptyResponse,
  JSONValue,
  ListSecretsRequest,
  ListSecretsResponse,
  SecretResource,
  UpsertSecretRequest,
  UpsertSecretV2Request,
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

      const conditions: SQL[] = [eq(schema.secret.workspaceId, workspaceId)];
      if (names?.length) {
        conditions.push(inArray(schema.secret.name, names));
      }

      const secrets = (
        await db()
          .select()
          .from(schema.secret)
          .where(and(...conditions))
      ).flatMap((secret) => {
        if (!secret.value) {
          return [];
        }
        return {
          workspaceId: secret.workspaceId,
          name: secret.name,
          value: secret.value,
        };
      });
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
      await db().transaction(async (pTx) => {
        const secret = await pTx.query.secret.findFirst({
          where: and(
            eq(schema.secret.workspaceId, workspaceId),
            eq(schema.secret.name, name),
          ),
        });
        const existingConfigValue =
          secret?.configValue && isObject(secret.configValue)
            ? secret.configValue
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
        await upsert({
          table: schema.secret,
          tx: pTx,
          values: {
            id: secret?.id,
            workspaceId,
            name,
            value,
            configValue: configValueToSave,
          },
          target: [schema.secret.workspaceId, schema.secret.name],
          set: {
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
      const result = await db()
        .delete(schema.secret)
        .where(
          and(
            eq(schema.secret.workspaceId, workspaceId),
            eq(schema.secret.id, id),
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
    "/v2",
    {
      schema: {
        description: "List secrets availability.",
        querystring: ListSecretsRequest,
        tags: ["Secrets"],
        response: {
          200: ListSecretsResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, names } = request.query;
      const availability = await getPlainTextSecretAvailablity({
        workspaceId,
        names,
      });
      return reply.status(200).send({ names: availability });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/v2",
    {
      schema: {
        description: "Delete a secret.",
        querystring: DeleteSecretV2Request,
        tags: ["Secrets"],
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, name } = request.query;
      const result = await deletePlainTextSecret({
        workspaceId,
        name,
      });
      if (!result) {
        return reply.status(404).send();
      }
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/v2",
    {
      schema: {
        description:
          "Create or update a secret. Will patch the secret definition if passed.",
        tags: ["Secrets"],
        body: UpsertSecretV2Request,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      await upsertPlainTextSecret(request.body);
      return reply.status(204).send();
    },
  );
}
