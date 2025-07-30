import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  archiveBroadcast,
  getBroadcastsV2,
  toBroadcastResource,
  triggerBroadcast,
  upsertBroadcast,
  upsertBroadcastV2,
} from "backend-lib/src/broadcasts";
import {
  cancelBroadcast,
  pauseBroadcast,
  resumeBroadcast,
  startBroadcastWorkflow,
  startRecomputeBroadcastSegmentWorkflow,
} from "backend-lib/src/broadcasts/lifecycle";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { isGmailAuthorized } from "backend-lib/src/gmail";
import logger from "backend-lib/src/logger";
import {
  BaseMessageResponse,
  BroadcastResource,
  BroadcastResourceV2,
  CancelBroadcastRequest,
  ExecuteBroadcastRequest,
  ExecuteBroadcastResponse,
  GetBroadcastsResponse,
  GetBroadcastsV2Request,
  GetGmailAuthorizationRequest,
  GetGmailAuthorizationResponse,
  PauseBroadcastRequest,
  RecomputeBroadcastSegmentRequest,
  ResumeBroadcastRequest,
  StartBroadcastRequest,
  TriggerBroadcastRequest,
  UpdateBroadcastArchiveRequest,
  UpdateBroadcastRequest,
  UpsertBroadcastV2Request,
} from "backend-lib/src/types";
import { eq } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { v5 as uuidv5 } from "uuid";

import { getOccupantFromRequest } from "../buildApp/requestContext";

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
      const broadcasts = await getBroadcastsV2(request.query);
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
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/recompute-segment",
    {
      schema: {
        description: "Recompute a broadcast segment.",
        tags: ["Broadcasts"],
        body: RecomputeBroadcastSegmentRequest,
        response: {
          204: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, broadcastId } = request.body;
      await startRecomputeBroadcastSegmentWorkflow({
        workspaceId,
        broadcastId,
      });
      return reply
        .status(204)
        .send({ message: "Broadcast segment recomputed" });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/start",
    {
      schema: {
        description: "Start a broadcast.",
        tags: ["Broadcasts"],
        body: StartBroadcastRequest,
        response: {
          200: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, broadcastId } = request.body;
      const occupant = getOccupantFromRequest(request);
      await startBroadcastWorkflow({
        workspaceId,
        broadcastId,
        workspaceOccupantId: occupant?.workspaceOccupantId,
        workspaceOccupantType: occupant?.workspaceOccupantType,
      });
      return reply.status(200).send({ message: "Broadcast started" });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/pause",
    {
      schema: {
        description: "Pause a broadcast.",
        tags: ["Broadcasts"],
        body: PauseBroadcastRequest,
        response: {
          200: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, broadcastId } = request.body;
      await pauseBroadcast({
        workspaceId,
        broadcastId,
      });
      return reply.status(200).send({ message: "Broadcast paused" });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/resume",
    {
      schema: {
        description: "Resume a broadcast.",
        tags: ["Broadcasts"],
        body: ResumeBroadcastRequest,
        response: {
          200: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, broadcastId } = request.body;
      await resumeBroadcast({
        workspaceId,
        broadcastId,
      });
      return reply.status(200).send({ message: "Broadcast resumed" });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/cancel",
    {
      schema: {
        description: "Cancel a broadcast.",
        tags: ["Broadcasts"],
        body: CancelBroadcastRequest,
        response: {
          200: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, broadcastId } = request.body;
      await cancelBroadcast({
        workspaceId,
        broadcastId,
      });
      return reply.status(200).send({ message: "Broadcast cancelled" });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/gmail-authorization",
    {
      schema: {
        description: "Get gmail authorization status",
        tags: ["Broadcasts"],
        querystring: GetGmailAuthorizationRequest,
        response: {
          200: GetGmailAuthorizationResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.query;
      const occupant = getOccupantFromRequest(request);
      if (!occupant) {
        logger().debug("No occupant found");
        return reply.status(401).send();
      }
      const authorized = await isGmailAuthorized({
        workspaceId,
        workspaceOccupantId: occupant.workspaceOccupantId,
      });
      return reply.status(200).send({ authorized });
    },
  );

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
