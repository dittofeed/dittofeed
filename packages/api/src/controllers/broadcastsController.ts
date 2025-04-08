import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  archiveBroadcast,
  getBroadcastsV2,
  toBroadcastResource,
  triggerBroadcast,
  upsertBroadcastV2,
} from "backend-lib/src/broadcasts";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import {
  BaseMessageResponse,
  BroadcastResource,
  BroadcastResourceV2,
  GetBroadcastsResponse,
  GetBroadcastsV2Request,
  TriggerBroadcastRequest,
  UpdateBroadcastArchiveRequest,
  UpdateBroadcastRequest,
  UpsertBroadcastV2Request,
} from "backend-lib/src/types";
import { eq } from "drizzle-orm";
import { FastifyInstance } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function broadcastsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/archive",
    {
      schema: {
        description: "Archive a broadcast.",
        tags: ["Broadcasts"],
        body: UpdateBroadcastArchiveRequest,
        response: {
          200: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await archiveBroadcast(request.body);
      if (!result) {
        return reply.status(404).send({ message: "Broadcast not found" });
      }
      return reply.status(200).send({ message: "Broadcast archived" });
    },
  );
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Get all broadcasts.",
        tags: ["Broadcasts"],
        querystring: GetBroadcastsV2Request,
        response: {
          200: GetBroadcastsResponse,
        },
      },
    },
    async (request, reply) => {
      const broadcasts = await getBroadcastsV2({
        workspaceId: request.query.workspaceId,
      });
      return reply.status(200).send(broadcasts);
    },
  );
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/v2",
    {
      schema: {
        description: "Upsert a v2 broadcast.",
        tags: ["Broadcasts"],
        body: UpsertBroadcastV2Request,
        response: {
          200: BroadcastResourceV2,
          404: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await upsertBroadcastV2(request.body);
      if (result.isErr()) {
        return reply.status(400).send(result.error);
      }
      return reply.status(200).send(result.value);
    },
  );
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
