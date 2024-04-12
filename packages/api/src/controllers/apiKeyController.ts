import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { createAdminApiKey } from "backend-lib/src/adminApiKeys";
import prisma from "backend-lib/src/prisma";
import { FastifyInstance } from "fastify";
import {
  CreateAdminApiKeyRequest,
  CreateAdminApiKeyResponse,
  DeleteAdminApiKeyRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function apiKeyController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/",
    {
      schema: {
        description: "Create an admin API key.",
        tags: ["API Key", "Admin"],
        body: CreateAdminApiKeyRequest,
        response: {
          200: CreateAdminApiKeyResponse,
          409: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const adminApiKey = await createAdminApiKey(request.body);
      if (adminApiKey.isErr()) {
        return reply.status(409).send();
      }
      const { workspaceId, name, id, apiKey, createdAt } = adminApiKey.value;

      return reply.status(200).send({
        workspaceId,
        name,
        id,
        apiKey,
        createdAt,
      });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description: "Delete an admin API key.",
        tags: ["API Key", "Admin"],
        querystring: DeleteAdminApiKeyRequest,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      await prisma().adminApiKey.delete({
        where: {
          workspaceId: request.query.workspaceId,
          id: request.query.id,
        },
      });

      return reply.status(200).send();
    },
  );
}
