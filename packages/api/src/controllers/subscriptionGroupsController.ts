import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import prisma from "backend-lib/src/prisma";
import {
  SubscriptionGroupResource,
  UpsertSubscriptionGroupResource,
} from "backend-lib/src/types";
import { FastifyInstance } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function subscriptionGroupsController(
  fastify: FastifyInstance
) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Create or update a journey.",
        body: UpsertSubscriptionGroupResource,
        response: {
          200: SubscriptionGroupResource,
        },
      },
    },
    async (request, reply) => {
      const { id, name, type, workspaceId } = request.body;

      await prisma().subscriptionGroup.upsert({
        where: {
          id,
        },
        create: {
          name,
          type,
          workspaceId,
          id,
        },
        update: {
          name,
          type,
        },
      });

      const resource: SubscriptionGroupResource = {
        id,
        name,
        workspaceId,
        type,
      };
      return reply.status(200).send(resource);
    }
  );
}
