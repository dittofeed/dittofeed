import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { triggerBroadcast, upsertBroadcast } from "backend-lib/src/broadcasts";
import {
  ExecuteBroadcastRequest,
  ExecuteBroadcastResponse,
} from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import { v5 as uuidv5 } from "uuid";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function adminBroadcastsController(
  fastify: FastifyInstance,
) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/execute",
    {
      schema: {
        description: "Create and trigger a broadcast.",
        tags: ["Broadcasts"],
        body: ExecuteBroadcastRequest,
        response: {
          200: ExecuteBroadcastResponse,
        },
      },
    },
    async (request, reply) => {
      const broadcastId = uuidv5(
        request.body.broadcastName,
        request.body.workspaceId,
      );
      await upsertBroadcast({
        broadcastId,
        workspaceId: request.body.workspaceId,
        name: request.body.broadcastName,
        segmentDefinition: request.body.segmentDefinition,
        messageTemplateDefinition: request.body.messageTemplateDefinition,
        subscriptionGroupId: request.body.subscriptionGroupId,
      });

      await triggerBroadcast({
        broadcastId,
        workspaceId: request.body.workspaceId,
      });

      return reply.status(200).send({
        broadcastId,
        broadcastName: request.body.broadcastName,
      });
    },
  );
}
