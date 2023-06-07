import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  generateDigest,
  verifyTimestampedSignature,
} from "backend-lib/src/crypto";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import { insertUserEvents } from "backend-lib/src/userEvents";
import { FastifyInstance } from "fastify";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
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
          "X-Twilio-Email-Event-Webhook-Signature": Type.String(),
          "X-Twilio-Email-Event-Webhook-Timestamp": Type.String(),
        }),
        body: Type.Array(Type.Object({})),
      },
    },
    async (request, reply) => {
      // const verified = verifyTimestampedSignature({
      //   signature: request.headers["X-Twilio-Email-Event-Webhook-Signature"],
      //   timestamp: request.headers["X-Twilio-Email-Event-Webhook-Timestamp"],
      //   payload: request.rawBody as string,
      //   secret: process.env.SENDGRID_WEBHOOK_SECRET,
      // });
      // headers: {
      //   "host": "ce99-23-227-237-252.ngrok.io",
      //   "user-agent": "SendGrid Event API",
      //   "content-length": "3741",
      //   "accept-encoding": "gzip",
      //   "content-type": "application/json",
      //   "x-forwarded-for": "54.70.106.128",
      //   "x-forwarded-proto": "https",
      //   "x-twilio-email-event-webhook-signature": "MEUCIQCzyoxjP6ZKiDJ+f+7SCa/g5TvHWSafzJLMH2kIaw0kygIgask3F/i8BIm/YD1Do1ukjkLK5s+X0PrfR7LpdlAO098=",
      //   "x-twilio-email-event-webhook-timestamp": "1686096408"
      // }
      // body: [
      //   {
      //     "email": "example@test.com",
      //     "timestamp": 1686096326,
      //     "smtp-id": "<14c5d75ce93.dfd.64b469@ismtpd-555>",
      //     "event": "processed",
      //     "category": [
      //       "cat facts"
      //     ],
      //     "sg_event_id": "ZCC3wcasi5Riq3JNT0dAVA==",
      //     "sg_message_id": "14c5d75ce93.dfd.64b469.filter0001.16648.5515E0B88.0"
      //   },
      logger().debug(
        { headers: request.headers, body: request.body },
        "sendgrid webhook payload"
      );

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
