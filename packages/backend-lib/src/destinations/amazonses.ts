import Https from "node:https";

import {
  MessageTag,
  SendEmailCommand,
  SendEmailCommandOutput,
  SendEmailRequest,
  SESv2Client,
  SESv2ServiceException,
} from "@aws-sdk/client-sesv2";
import { SpanStatusCode } from "@opentelemetry/api";
import { SourceType } from "isomorphic-lib/src/constants";
import {
  jsonParseSafe,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result, ResultAsync } from "neverthrow";
import * as R from "remeda";
import SnsPayloadValidator from "sns-payload-validator";
import { Overwrite } from "utility-types";
import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "../apps/batch";
import { MESSAGE_METADATA_FIELDS } from "../constants";
import logger from "../logger";
import { withSpan } from "../openTelemetry";
import {
  AmazonSesConfig,
  AmazonSesEventPayload,
  AmazonSesMailFields,
  AmazonSesNotificationType,
  AmazonSNSEvent,
  AmazonSNSNotificationEvent,
  AmazonSNSSubscriptionEvent,
  AmazonSNSUnsubscribeEvent,
  BatchTrackData,
  EmailProviderType,
  EventType,
  InternalEventType,
} from "../types";

// README the typescript types on this are wrong, body is not of type string,
// it's a parsed JSON object
function guardResponseError(e: unknown): SESv2ServiceException {
  if (e instanceof SESv2ServiceException) {
    return e;
  }
  throw e;
}

export async function sendMail({
  config,
  mailData,
}: {
  config: AmazonSesConfig;
  mailData: Overwrite<AmazonSesMailFields, { tags?: Record<string, string> }>;
}): Promise<Result<SendEmailCommandOutput, SESv2ServiceException>> {
  const { accessKeyId, secretAccessKey, region } = config;
  const client = new SESv2Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const tags: MessageTag[] | undefined = mailData.tags
    ? Object.entries(mailData.tags).map(([Name, Value]) => ({
        Name,
        Value,
      }))
    : undefined;

  logger().info(
    {
      tags,
    },
    "sending ses tags",
  );

  const input: SendEmailRequest = {
    FromEmailAddress: mailData.from,
    Destination: {
      ToAddresses: [mailData.to],
    },
    Content: {
      Simple: {
        Subject: {
          Data: mailData.subject,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: mailData.html,
            Charset: "UTF-8",
          },
        },
        Headers: mailData.headers
          ? Object.entries(mailData.headers).map(([Name, Value]) => ({
              Name,
              Value,
            }))
          : undefined,
      },
    },
    EmailTags: tags,
    ReplyToAddresses: mailData.replyTo ? [mailData.replyTo] : undefined,
  };

  const command = new SendEmailCommand(input);

  return ResultAsync.fromPromise(client.send(command), guardResponseError).map(
    (resultArray) => resultArray,
  );
}

export async function submitAmazonSesEvents(
  event: AmazonSesEventPayload,
): Promise<ResultAsync<void, Error>> {
  return withSpan({ name: "submit-amazon-ses-events" }, async (span) => {
    // TODO: Amazon may batch requests (if we send with multiple To: addresses? or with the BatchTemplated endpoint).  We should map over the receipients.
    let tags: Record<string, string>;
    if (event.mail.tags) {
      const mappedTags: Record<string, string> = {};
      for (const [key, values] of Object.entries(event.mail.tags)) {
        const [value] = values;
        if (value) {
          mappedTags[key] = value;
        }
      }
      tags = mappedTags;
    } else {
      tags = {};
    }

    const workspaceId = tags.workspaceId ?? null;
    const userId = tags.userId ?? null;

    for (const [key, value] of Object.entries(tags)) {
      span.setAttribute(key, value);
    }

    if (!workspaceId) {
      return err(new Error("Workspace id not found"));
    }

    let timestamp: string;
    let eventName: InternalEventType;
    switch (event.eventType) {
      case AmazonSesNotificationType.Bounce:
        eventName = InternalEventType.EmailBounced;
        timestamp = event.bounce.timestamp;
        break;
      case AmazonSesNotificationType.Complaint:
        eventName = InternalEventType.EmailMarkedSpam;
        timestamp = event.complaint.timestamp;
        break;
      case AmazonSesNotificationType.Delivery:
        eventName = InternalEventType.EmailDelivered;
        timestamp = event.delivery.timestamp;
        break;
      case AmazonSesNotificationType.Open:
        eventName = InternalEventType.EmailOpened;
        timestamp = event.open.timestamp;
        break;
      case AmazonSesNotificationType.Click:
        eventName = InternalEventType.EmailClicked;
        timestamp = event.click.timestamp;
        break;
      default:
        return err(
          new Error(`Unhandled Amazon SES event type: ${event.eventType}`),
        );
    }

    const messageId = uuidv5(event.mail.messageId, workspaceId);
    const metadataTags = R.pick(tags, MESSAGE_METADATA_FIELDS);

    const items: BatchTrackData[] = [];
    if (userId) {
      items.push({
        type: EventType.Track,
        event: eventName,
        userId,
        messageId,
        timestamp,
        properties: {
          email: event.mail.destination?.[0],
          ...metadataTags,
        },
      });
    }
    return ResultAsync.fromPromise(
      submitBatch({
        workspaceId,
        data: {
          context: {
            source: SourceType.Webhook,
            provider: EmailProviderType.AmazonSes,
          },
          batch: items,
          ...metadataTags,
        },
      }),
      (e) => (e instanceof Error ? e : Error(e as string)),
    );
  });
}

export async function validSNSSignature(payload: AmazonSNSEvent) {
  const validator = new SnsPayloadValidator();

  return ResultAsync.fromPromise(validator.validate(payload), (error) => error);
}

export async function confirmSubscription(
  payload: AmazonSNSSubscriptionEvent | AmazonSNSUnsubscribeEvent,
) {
  return ResultAsync.fromPromise(
    new Promise((res) => {
      Https.get(payload.SubscribeURL, res);
    }),
    (error) => error,
  );
}

export async function handleSesNotification(
  payload: AmazonSNSNotificationEvent,
): Promise<Result<void, Error>> {
  return withSpan({ name: "handle-ses-notification" }, async (span) => {
    const validated = jsonParseSafe(payload.Message).andThen((parsed) =>
      schemaValidateWithErr(parsed, AmazonSesEventPayload),
    );
    if (validated.isErr()) {
      logger().error(
        {
          err: validated.error,
        },
        "Invalid AmazonSes event payload.",
      );

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: validated.error.message,
      });
      return err(validated.error);
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
      return err(result.error);
    }
    return ok(undefined);
  });
}
