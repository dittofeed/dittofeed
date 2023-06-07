import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  generateDigest,
  verifyTimestampedSignature,
} from "backend-lib/src/crypto";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import { SendgridEvent } from "backend-lib/src/types";
import { insertUserEvents } from "backend-lib/src/userEvents";
import { FastifyInstance } from "fastify";
import {
  SENDGRID_WEBHOOK_SECRET_NAME,
  WORKSPACE_ID_HEADER,
} from "isomorphic-lib/src/constants";
import { WorkspaceId } from "isomorphic-lib/src/types";

import { getWorkspaceIdFromReq } from "../workspace";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function webhookController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/sendgrid",
    {
      schema: {
        description: "Used to consume sendgrid webhook payloads.",
        headers: Type.Object({
          "x-twilio-email-event-webhook-signature": Type.String(),
          "x-twilio-email-event-webhook-timestamp": Type.String(),
        }),
        body: Type.Array(SendgridEvent),
      },
    },
    async (request, reply) => {
      const workspaceId = request.body[0]?.custom_args?.workspaceId;

      if (!workspaceId) {
        return reply.status(400).send({
          error: "Missing workspaceId custom arg.",
        });
      }

      const secret = await prisma().secret.findUnique({
        where: {
          workspaceId_name: {
            name: SENDGRID_WEBHOOK_SECRET_NAME,
            workspaceId,
          },
        },
      });

      if (!secret) {
        return reply.status(400).send({
          error: "Missing secret.",
        });
      }

      const publicKey = `-----BEGIN PUBLIC KEY-----\n${secret.value}\n-----END PUBLIC KEY-----`;

      if (!request.rawBody || typeof request.rawBody !== "string") {
        logger().error("Missing rawBody.");
        return reply.status(500).send();
      }

      const verified = verifyTimestampedSignature({
        signature: request.headers["x-twilio-email-event-webhook-signature"],
        timestamp: request.headers["x-twilio-email-event-webhook-timestamp"],
        payload: request.rawBody,
        publicKey,
      });

      if (!verified) {
        logger().error("Invalid signature.");
        return reply.status(401).send({
          message: "Invalid signature.",
        });
      }

      return reply.status(200).send();
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/segment",
    {
      schema: {
        description:
          "Used to consume segment.io webhook payloads. Must be exposed publicly to the internet.",
        body: Type.Object(
          {
            messageId: Type.String(),
            timestamp: Type.String(),
          },
          { additionalProperties: true }
        ),
        headers: Type.Object({
          "x-signature": Type.String(),
          [WORKSPACE_ID_HEADER]: Type.Optional(WorkspaceId),
        }),
      },
    },
    async (request, reply) => {
      const workspaceId = getWorkspaceIdFromReq(request);
      const config = await prisma().segmentIOConfiguration.findUnique({
        where: { workspaceId },
      });

      if (!config) {
        return reply.status(503).send();
      }

      if (!request.rawBody || typeof request.rawBody !== "string") {
        // Should always be defined
        return reply.status(500).send();
      }

      const { sharedSecret } = config;
      const signature = request.headers["x-signature"];

      const digest = generateDigest({
        rawBody: request.rawBody,
        sharedSecret,
      });

      if (signature !== digest) {
        return reply.status(401).send();
      }

      await insertUserEvents({
        workspaceId,
        userEvents: [
          {
            messageId: request.body.messageId,
            messageRaw: request.rawBody,
          },
        ],
      });

      return reply.status(200).send();
    }
  );
}
