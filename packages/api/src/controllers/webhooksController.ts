import formbody from "@fastify/formbody";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { SpanStatusCode } from "@opentelemetry/api";
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
import { submitTwilioEvents } from "backend-lib/src/destinations/twilio";
import logger from "backend-lib/src/logger";
import { withSpan } from "backend-lib/src/openTelemetry";
import prisma from "backend-lib/src/prisma";
import {
  AmazonSesEventPayload,
  AmazonSNSEvent,
  AmazonSNSEventTypes,
  MailChimpEvent,
  PostMarkEvent,
  ResendEvent,
  SendgridEvent,
  TwilioEventSms,
} from "backend-lib/src/types";
import { insertUserEvents } from "backend-lib/src/userEvents";
import { FastifyInstance } from "fastify";
import { fastifyRawBody } from "fastify-raw-body";
import { SecretNames, WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  MailChimpSecret,
  PostMarkSecret,
  ResendSecret,
  SendgridSecret,
  TwilioSecret,
  WorkspaceId,
} from "isomorphic-lib/src/types";
import { Webhook } from "svix";
import { validateRequest } from "twilio";

import { getWorkspaceId } from "../workspace";
import { submitMailChimpEvents } from "backend-lib/src/destinations/mailchimp";
import { createHmac } from "crypto";

const TWILIO_CONFIG_ERR_MSG = "Twilio configuration not found";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function webhookController(fastify: FastifyInstance) {
  await fastify.register(formbody);
  await fastify.register(fastifyRawBody);

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
            name: SecretNames.Sendgrid,
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
      return withSpan({ name: "amazon-ses-webhook" }, async (span) => {
        logger().debug({ body: request.body }, "Received AmazonSES event.");

        // Validate the signature
        const valid = await validSNSSignature(request.body);

        if (valid.isErr()) {
          logger().error(
            "Invalid signature for AmazonSES webhook.",
            valid.error,
          );
          return reply.status(401).send({ message: "Invalid signature" });
        }

        const { body } = request;
        span.setAttribute("type", body.Type);
        switch (body.Type) {
          // Amazon will send a confirmation Type event we must use to enable (subscribe to) the webhook.
          // UnsubscribeConfirmation type events occur when our application requests disabling
          // the webhook. Since we never do this, we respond by re-confirming the subscription.
          case AmazonSNSEventTypes.SubscriptionConfirmation:
          case AmazonSNSEventTypes.UnsubscribeConfirmation:
            /* eslint-disable-next-line no-case-declarations */
            const confirmed = await confirmSubscription(body);
            if (confirmed.isErr()) {
              logger().error("Unable to confirm AmazonSNS subscription.", {
                error: confirmed.error,
              });
              return reply.status(401).send({});
            }
            logger().debug("AmazonSES Subscription confirmed");
            break;
          case AmazonSNSEventTypes.Notification: {
            const parsed: unknown = JSON.parse(body.Message);
            const validated = schemaValidateWithErr(
              parsed,
              AmazonSesEventPayload,
            );
            if (validated.isErr()) {
              logger().error(
                {
                  err: validated.error,
                },
                "Invalid AmazonSes event payload.",
              );
              return reply.status(500).send();
            }
            for (const [key, values] of Object.entries(
              validated.value.mail.tags ?? {},
            )) {
              const [value] = values;
              if (!value) {
                continue;
              }
              span.setAttribute(key, value);
            }
            const result = await submitAmazonSesEvents(validated.value);
            if (result.isErr()) {
              logger().error(
                {
                  err: result.error,
                  notification: validated.value,
                },
                "Error submitting AmazonSes events.",
              );
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: result.error.message,
              });
              return reply.status(500).send();
            }
            break;
          }
        }

        return reply.status(200).send();
      });
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
            name: SecretNames.Resend,
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
            name: SecretNames.Postmark,
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
    "/mailchimp",
    {
      schema: {
        description: "Used to consume Mailchimp (Mandrill) webhook payloads.",
        tags: ["Webhooks"],
        body: Type.Object({
          mandrill_events: Type.Array(MailChimpEvent),
        }),
        headers: Type.Object({
          "x-mandrill-signature": Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const { mandrill_events: events } = request.body;
      const workspaceId = events[0]?.msg?.metadata?.workspaceId;
      if (!workspaceId) {
        logger().error("Missing workspaceId in Mailchimp webhook metadata");
        return reply.status(400).send({
          error: "Missing workspaceId in metadata.",
        });
      }

      const secret = await prisma().secret.findUnique({
        where: {
          workspaceId_name: {
            name: SecretNames.MailChimp,
            workspaceId,
          },
        },
      });

      const webhookKey = schemaValidateWithErr(
        secret?.configValue,
        MailChimpSecret,
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

      // Verify webhook signature
      const signature = request.headers["x-mandrill-signature"];

      if (!request.rawBody || typeof request.rawBody !== "string") {
        logger().error({ workspaceId }, "Missing rawBody on Mailchimp webhook");
        return reply.status(500).send();
      }

      const params = { mandrill_events: request.rawBody } as Record<
        string,
        string
      >;
      let signedData = request.url;
      const paramKeys = Object.keys(params).sort();

      for (const key of paramKeys) {
        signedData += key + params[key];
      }

      const hmac = createHmac("sha1", webhookKey);
      hmac.update(signedData);
      const expectedSignature = hmac.digest("base64");

      if (signature !== expectedSignature) {
        logger().error(
          { workspaceId },
          "Invalid signature for Mailchimp webhook.",
        );
        return reply.status(401).send({
          message: "Invalid signature.",
        });
      }

      await submitMailChimpEvents({
        workspaceId,
        events,
      });

      return reply.status(200).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/twilio",
    {
      schema: {
        description: "Used to consume Twilio webhook payloads.",
        tags: ["Webhooks"],
        headers: Type.Object({
          "x-twilio-signature": Type.String(),
        }),
        body: TwilioEventSms,
        querystring: Type.Object({
          workspaceId: Type.String(),
          userId: Type.String(),
          subscriptionGroupId: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId, userId, subscriptionGroupId } = request.query;

      const twilioSecretModel = await prisma().secret.findUnique({
        where: {
          workspaceId_name: {
            name: SecretNames.Twilio,
            workspaceId,
          },
        },
      });

      const twilioSecretResult = schemaValidateWithErr(
        twilioSecretModel?.configValue,
        TwilioSecret,
      );
      if (twilioSecretResult.isErr()) {
        return reply.status(503).send({
          message: TWILIO_CONFIG_ERR_MSG,
        });
      }
      const twilioSecret = twilioSecretResult.value;
      if (
        !twilioSecret.authToken ||
        !twilioSecret.accountSid ||
        !twilioSecret.messagingServiceSid
      ) {
        return reply.status(503).send({
          message: TWILIO_CONFIG_ERR_MSG,
        });
      }

      // TODO refactor this into the backend config, using just the host not the path
      const url =
        process.env.TWILIO_STATUS_CALLBACK_URL ?? "https://app.dittofeed.com";

      const verified = validateRequest(
        twilioSecret.authToken,
        request.headers["x-twilio-signature"],
        `${url}${request.url}`,
        request.body,
      );

      if (!verified) {
        logger().error(
          {
            workspaceId,
          },
          "Invalid signature for twilio webhook.",
        );
        return reply.status(401).send({
          message: "Invalid signature.",
        });
      }

      await submitTwilioEvents({
        workspaceId,
        userId,
        TwilioEvent: request.body,
        subscriptionGroupId,
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
      const workspaceIdResult = await getWorkspaceId(request);
      if (workspaceIdResult.isErr()) {
        return reply.status(400).send();
      }
      const workspaceId = workspaceIdResult.value;
      if (!workspaceId) {
        return reply.status(400).send({
          error: "Missing workspaceId. Try setting the df-workspace-id header.",
        });
      }
      const config = await prisma().segmentIOConfiguration.findUnique({
        where: { workspaceId: workspaceIdResult.value },
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
