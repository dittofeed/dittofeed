import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { toBroadcastResource } from "backend-lib/src/broadcasts";
import prisma from "backend-lib/src/prisma";
import {
  broadcastWorkflow,
  generateBroadcastWorkflowId,
} from "backend-lib/src/segments/broadcastWorkflow";
import connectWorkflowClient from "backend-lib/src/temporal/connectWorkflowClient";
import {
  BroadcastResource,
  EmptyResponse,
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
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/trigger",
    {
      schema: {
        description: "Trigger a broadcast.",
        body: TriggerBroadcastRequest,
        response: {
          201: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const temporalClient = await connectWorkflowClient();
      const { workspaceId, id: broadcastId } = request.body;

      await temporalClient.start(broadcastWorkflow, {
        taskQueue: "default",
        workflowId: generateBroadcastWorkflowId({
          workspaceId,
          broadcastId,
        }),
        args: [
          {
            workspaceId,
            broadcastId,
          },
        ],
      });
      return reply.status(201).send();
    }
  );
}
