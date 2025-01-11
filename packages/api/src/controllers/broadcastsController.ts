import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  toBroadcastResource,
  triggerBroadcast,
} from "backend-lib/src/broadcasts";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import {
  BaseMessageResponse,
  BroadcastResource,
  TriggerBroadcastRequest,
  UpdateBroadcastRequest,
} from "backend-lib/src/types";
import { eq } from "drizzle-orm";
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
          404: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const [broadcast] = await db()
        .update(schema.broadcast)
        .set({
          name: request.body.name,
        })
        .where(eq(schema.broadcast.id, request.body.id))
        .returning();
      if (!broadcast) {
        return reply.status(404).send({
          message: "Broadcast not found",
        });
      }
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
