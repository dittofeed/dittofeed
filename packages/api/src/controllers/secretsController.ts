import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import prisma from "backend-lib/src/prisma";
import { FastifyInstance } from "fastify";
import {
  DeleteSecretRequest,
  EmptyResponse,
  UpsertSecretRequest,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function secretsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Create or update a secret.",

        body: UpsertSecretRequest,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, name, value } = request.body;
      await prisma().secret.upsert({
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
        },
        update: {
          value,
        },
      });
      return reply.status(204).send();
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description: "Delete a secret.",

        body: DeleteSecretRequest,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, name } = request.body;
      await prisma().secret.deleteMany({
        where: {
          workspaceId,
          name,
        },
      });
      return reply.status(204).send();
    }
  );
}
