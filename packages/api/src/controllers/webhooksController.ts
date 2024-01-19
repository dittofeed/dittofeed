import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  generateDigest,
  verifyTimestampedSignature,
} from "backend-lib/src/crypto";
import { submitResendEvents } from "backend-lib/src/destinations/resend";
import { submitSendgridEvents } from "backend-lib/src/destinations/sendgrid";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import { ResendEvent, SendgridEvent } from "backend-lib/src/types";
import { insertUserEvents } from "backend-lib/src/userEvents";
import { createHmac } from "crypto";
import { FastifyInstance } from "fastify";
import {
  RESEND_SECRET,
  SENDGRID_SECRET,
  WORKSPACE_ID_HEADER,
} from "isomorphic-lib/src/constants";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { ResendSecret, SendgridSecret, WorkspaceId } from "isomorphic-lib/src/types";

import { getWorkspaceId } from "../workspace";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function webhookController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/sendgrid",
    {
      schema: {
        description: "Used to consume sendgrid webhook payloads.",
        tags: ["Webhooks"],
        headers: Type.Object({
          "x-twilio-email-event-webhook-signature": Type.String(),
          "x-twilio-email-event-webhook-timestamp": Type.String(),
        }),
        body: Type.Array(SendgridEvent),
      },
    },
    async (request, reply) => {
      logger().debug({ body: request.body }, "Received sendgrid events.");
      // TODO allow for multiple workspaces on a single sendgrid account
      const firstEvent = request.body[0];
      const workspaceId = firstEvent?.workspaceId;

      if (!workspaceId) {
        logger().error("Missing workspaceId on sendgrid events.");
        return reply.status(400).send({
          error: "Missing workspaceId custom arg.",
        });
      }

      const secret = await prisma().secret.findUnique({
        where: {
          workspaceId_name: {
            name: SENDGRID_SECRET,
            workspaceId,
          },
        },
      });
      const webhookKey = schemaValidateWithErr(
        secret?.configValue,
        SendgridSecret
      )
        .map((val) => val.webhookKey)
        .unwrapOr(null);

      if (!webhookKey) {
        logger().error(
          {
            workspaceId,
          },
          "Missing sendgrid webhook secret."
        );
        return reply.status(400).send({
          error: "Missing secret.",
        });
      }

      const publicKey = `-----BEGIN PUBLIC KEY-----\n${webhookKey}\n-----END PUBLIC KEY-----`;

      if (!request.rawBody || typeof request.rawBody !== "string") {
        logger().error({ workspaceId }, "Missing rawBody on sendgrid webhook.");
        return reply.status(500).send();
      }

      const verified = verifyTimestampedSignature({
        signature: request.headers["x-twilio-email-event-webhook-signature"],
        timestamp: request.headers["x-twilio-email-event-webhook-timestamp"],
        payload: request.rawBody,
        publicKey,
      });

      if (!verified) {
        logger().error(
          {
            workspaceId,
          },
          "Invalid signature for sendgrid webhook."
        );
        return reply.status(401).send({
          message: "Invalid signature.",
        });
      }

      await submitSendgridEvents({
        workspaceId,
        events: request.body,
      });
      return reply.status(200).send();
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/resend",
    {
      schema: {
        description: "Used to consume resend webhook payloads.",
        tags: ["Webhooks"],
        headers: Type.Object({
          "svix-id": Type.String(),
          "svix-timestamp": Type.String(),
          "svix-signature": Type.String(),
        }),
        body: Type.Array(ResendEvent),
      },
    },
    async (request, reply) => {
      logger().debug({ body: request.body }, "Received resend events.");

      const workspaceId = await getWorkspaceId(request);
      if (!workspaceId) {
        return reply.status(400).send({
          error: "Missing workspaceId. Try setting the df-workspace-id header.",
        });
      }

      if (!workspaceId) {
        logger().error("Missing workspaceId on resend events.");
        return reply.status(400).send({
          error: "Missing workspaceId custom arg.",
        });
      }

      const secret = await prisma().secret.findUnique({
        where: {
          workspaceId_name: {
            name: RESEND_SECRET,
            workspaceId,
          },
        },
      });
      const webhookKey = schemaValidateWithErr(
        secret?.configValue,
        ResendSecret
      )
        .map((val) => val.webhookKey)
        .unwrapOr(null);

      if (!webhookKey) {
        logger().error(
          {
            workspaceId,
          },
          "Missing resend webhook secret."
        );
        return reply.status(400).send({
          error: "Missing secret.",
        });
      }

      if (!request.rawBody || typeof request.rawBody !== "string") {
        logger().error({ workspaceId }, "Missing rawBody on resend webhook.");
        return reply.status(500).send();
      }

      const svixId = request.headers["svix-id"];
      const svixTimestamp = request.headers["svix-timestamp"];
      const svixSignature = request.headers["svix-signature"];
      const signedContent = `${svixId}.${svixTimestamp}.${request.rawBody}`;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const secretBytes = Buffer.from(webhookKey.split('_')[1]!, "base64");

      const expectedSignature = createHmac('sha256', secretBytes)
        .update(signedContent)
        .digest('base64');

      const receivedSignatures = svixSignature.split(' ');

      // The svix-signature header can contain multiple signatures so we check 
      // if any of the received signatures match the expected signature 
      const verified = receivedSignatures.some(sig => sig.split(',')[1] === expectedSignature);

      if (!verified) {
        logger().error(
          {
            workspaceId,
          },
          "Invalid signature for resend webhook."
        );
        return reply.status(401).send({
          message: "Invalid signature.",
        });
      }

      await submitResendEvents({
        workspaceId,
        events: request.body,
      });
      return reply.status(200).send();
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/segment",
    {
      schema: {
        description:
          "Used to consume segment.io webhook payloads. Must be exposed publicly to the internet.",
        tags: ["Webhooks"],
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
      const workspaceId = await getWorkspaceId(request);
      if (!workspaceId) {
        return reply.status(400).send({
          error: "Missing workspaceId. Try setting the df-workspace-id header.",
        });
      }
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
