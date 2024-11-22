import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  toBroadcastResource,
  triggerBroadcast,
} from "backend-lib/src/broadcasts";
import prisma from "backend-lib/src/prisma";
import {
  BroadcastResource,
  TriggerBroadcastRequest,
  UpdateBroadcastRequest,
} from "backend-lib/src/types";
import { FastifyInstance } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function broadcastsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Update a broadcast.",
        tags: ["Broadcasts"],
        body: UpdateBroadcastRequest,
        response: {
          200: BroadcastResource,
        },
      },
    },
    async (request, reply) => {
      const broadcast = await prisma().broadcast.update({
        where: {
          id: request.body.id,
        },
        data: {
          name: request.body.name,
        },
      });
      return reply.status(200).send(toBroadcastResource(broadcast));
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/trigger",
    {
      schema: {
        description: "Trigger a broadcast.",
        tags: ["Broadcasts"],
        body: TriggerBroadcastRequest,
        response: {
          200: BroadcastResource,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, id: broadcastId } = request.body;
      const broadcast = await triggerBroadcast({
        broadcastId,
        workspaceId,
      });
      return reply.status(200).send(broadcast);
    },
  );
}
