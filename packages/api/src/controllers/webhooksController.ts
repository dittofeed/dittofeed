import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  generateDigest,
  verifyTimestampedSignature,
} from "backend-lib/src/crypto";
import {
  confirmSubscription,
  submitAmazonSesEvents,
  validSNSSignature,
} from "backend-lib/src/destinations/amazonses";
import { submitPostmarkEvents } from "backend-lib/src/destinations/postmark";
import { submitResendEvents } from "backend-lib/src/destinations/resend";
import { submitSendgridEvents } from "backend-lib/src/destinations/sendgrid";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import {
  AmazonSesEventPayload,
  AmazonSNSEvent,
  AmazonSNSEventTypes,
  PostMarkEvent,
  ResendEvent,
  SendgridEvent,
} from "backend-lib/src/types";
import { insertUserEvents } from "backend-lib/src/userEvents";
import { FastifyInstance } from "fastify";
import {
  POSTMARK_SECRET,
  RESEND_SECRET,
  SENDGRID_SECRET,
  WORKSPACE_ID_HEADER,
} from "isomorphic-lib/src/constants";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  PostMarkSecret,
  ResendSecret,
  SendgridSecret,
  WorkspaceId,
} from "isomorphic-lib/src/types";
import { Webhook } from "svix";

import { getWorkspaceId } from "../workspace";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function webhookController(fastify: FastifyInstance) {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  fastify.addHook("onSend", async (_request, reply, payload) => {
    if (reply.statusCode !== 400) {
      return payload;
    }
    logger().error(
      {
        payload,
      },
      "Failed to validate webhook payload.",
    );
    return payload;
  });

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
        SendgridSecret,
      )
        .map((val) => val.webhookKey)
        .unwrapOr(null);

      if (!webhookKey) {
        logger().error(
          {
            workspaceId,
          },
          "Missing sendgrid webhook secret.",
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
          "Invalid signature for sendgrid webhook.",
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
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/amazon-ses",
    {
      schema: {
        description: "Used to consume amazonses notification events.",
        tags: ["Webhooks"],
        body: AmazonSNSEvent,
      },
      // Force JSON parsing the request body as SNS send requests with text/plain content-type.
      onRequest: (req, _, done) => {
        // eslint-disable-next-line no-param-reassign
        req.headers["content-type"] = "application/json";
        done();
      },
    },
    async (request, reply) => {
      logger().debug({ body: request.body }, "Received AmazonSES event.");

      // Validate the signature
      const valid = await validSNSSignature(request.body);

      if (valid.isErr()) {
        logger().error("Invalid signature for AmazonSES webhook.", valid.error);
        return reply.status(401).send({ message: "Invalid signature" });
      }

      switch (request.body.Type) {
        // Amazon will send a confirmation Type event we must use to enable (subscribe to) the webhook.
        // UnsubscribeConfirmation type events occur when our application requests disabling
        // the webhook. Since we never do this, we respond by re-confirming the subscription.
        case AmazonSNSEventTypes.SubscriptionConfirmation:
        case AmazonSNSEventTypes.UnsubscribeConfirmation:
          /* eslint-disable-next-line no-case-declarations */
          const confirmed = await confirmSubscription(request.body);
          if (confirmed.isErr()) {
            logger().error("Unable to confirm AmazonSNS subscription.", {
              error: confirmed.error,
            });
            return reply.status(401).send({});
          }
          logger().debug("AmazonSES Subscription confirmed");
          break;
        case AmazonSNSEventTypes.Notification: {
          await submitAmazonSesEvents(
            JSON.parse(request.body.Message) as AmazonSesEventPayload,
          );
          break;
        }
        default: {
          logger().error("Unknown AmazonSes event type");
        }
      }

      return reply.status(200).send();
    },
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
        body: ResendEvent,
      },
    },
    async (request, reply) => {
      logger().debug({ body: request.body }, "Received resend events.");

      const { workspaceId } = request.body.data.tags;
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
        ResendSecret,
      )
        .map((val) => val.webhookKey)
        .unwrapOr(null);

      if (!webhookKey) {
        logger().error(
          {
            workspaceId,
          },
          "Missing resend webhook secret.",
        );
        return reply.status(400).send({
          error: "Missing secret.",
        });
      }

      if (!request.rawBody || typeof request.rawBody !== "string") {
        logger().error({ workspaceId }, "Missing rawBody on resend webhook.");
        return reply.status(500).send();
      }

      const wh = new Webhook(webhookKey);
      const verified = wh.verify(request.rawBody, request.headers);

      if (!verified) {
        logger().error(
          {
            workspaceId,
          },
          "Invalid signature for resend webhook.",
        );
        return reply.status(401).send({
          message: "Invalid signature.",
        });
      }

      await submitResendEvents({
        workspaceId,
        events: [request.body],
      });
      return reply.status(200).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/postmark",
    {
      schema: {
        description: "Used to consume postmark webhook payloads.",
        tags: ["Webhooks"],
        headers: Type.Object({
          "x-postmark-secret": Type.String(),
        }),
        body: PostMarkEvent,
      },
    },
    async (request, reply) => {
      logger().debug({ body: request.body }, "Received postmark events.");
      const { workspaceId } = request.body.Metadata;

      if (!workspaceId || typeof workspaceId !== "string") {
        logger().error("Missing workspaceId in Metadata.");
        return reply.status(400).send({
          error: "Missing workspaceId in Metadata.",
        });
      }

      const secret = await prisma().secret.findUnique({
        where: {
          workspaceId_name: {
            name: POSTMARK_SECRET,
            workspaceId,
          },
        },
      });

      const secretHeader = request.headers["x-postmark-secret"];

      const webhookKey = schemaValidateWithErr(
        secret?.configValue,
        PostMarkSecret,
      )
        .map((val) => val.webhookKey)
        .unwrapOr(null);

      if (!webhookKey) {
        logger().error(
          {
            workspaceId,
          },
          "Missing postmark webhook secret.",
        );
        return reply.status(400).send({
          error: "Missing secret.",
        });
      }

      if (webhookKey !== secretHeader) {
        logger().error("Invalid signature for PostMark webhook.");
        return reply.status(401).send({
          message: "Invalid signature.",
        });
      }

      await submitPostmarkEvents({
        workspaceId,
        events: [request.body],
      });
      return reply.status(200).send();
    },
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
          { additionalProperties: true },
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
    },
  );
}
