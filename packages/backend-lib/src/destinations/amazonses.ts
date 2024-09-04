import Https from "node:https";

import {
  MessageTag,
  SendEmailCommand,
  SendEmailCommandOutput,
  SendEmailRequest,
  SESv2Client,
  SESv2ServiceException,
} from "@aws-sdk/client-sesv2";
import { SourceType } from "isomorphic-lib/src/constants";
import { err, Result, ResultAsync } from "neverthrow";
import * as R from "remeda";
import SnsPayloadValidator from "sns-payload-validator";
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
  AmazonSNSSubscriptionEvent,
  AmazonSNSUnsubscribeEvent,
  BatchTrackData,
  EmailProviderType,
  EventType,
  InternalEventType,
} from "../types";

function unwrapTag(tagName: string, tags: Record<string, string[]>) {
  if (!tags[tagName]) {
    return null;
  }

  return tags[tagName]?.[0] ?? null;
}

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
  mailData: AmazonSesMailFields;
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
    ? Object.keys(mailData.tags).reduce((a: MessageTag[], k: string) => {
        return mailData.tags ? [{ Name: k, Value: mailData.tags[k] }, ...a] : a;
      }, [])
    : undefined;

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
    logger().debug(event);

    const workspaceId = unwrapTag("workspaceId", event.mail.tags);
    const userId = unwrapTag("userId", event.mail.tags);

    for (const [key, value] of Object.entries(event.mail.tags)) {
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

    const items: BatchTrackData[] = [];
    if (userId) {
      items.push({
        type: EventType.Track,
        event: eventName,
        userId,
        messageId,
        timestamp,
        properties: {
          email: event.mail.destination[0],
          ...R.pick(event.mail.tags, MESSAGE_METADATA_FIELDS),
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
          ...R.pick(event.mail.tags, MESSAGE_METADATA_FIELDS),
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
