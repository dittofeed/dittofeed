import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { toBroadcastResource } from "backend-lib/src/broadcasts";
import prisma from "backend-lib/src/prisma";
import {
  broadcastWorkflow,
  generateBroadcastWorkflowId,
} from "backend-lib/src/segments/broadcastWorkflow";
import connectWorkflowClient from "backend-lib/src/temporal/connectWorkflowClient";
import { isAlreadyStartedError } from "backend-lib/src/temporal/workflow";
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
      const temporalClient = await connectWorkflowClient();
      const { workspaceId, id: broadcastId } = request.body;

      try {
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
      } catch (e) {
        if (!isAlreadyStartedError(e)) {
          throw e;
        }
      }

      const broadcast = await prisma().broadcast.update({
        where: {
          id: broadcastId,
        },
        data: {
          status: "InProgress",
        },
      });
      return reply.status(200).send(toBroadcastResource(broadcast));
    },
  );
}
