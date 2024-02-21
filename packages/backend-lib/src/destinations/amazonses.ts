import Https from "node:https";

import {
  MessageTag,
  SendEmailCommand,
  type SendEmailCommandInput,
  SendEmailCommandOutput,
  SESClient,
  SESServiceException,
} from "@aws-sdk/client-ses";
import { err, Result, ResultAsync } from "neverthrow";
import * as R from "remeda";
import SnsPayloadValidator from "sns-payload-validator";
import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "../apps/batch";
import { MESSAGE_METADATA_FIELDS } from "../constants";
import logger from "../logger";
import {
  AmazonSesConfig,
  AmazonSesEventPayload,
  AmazonSesMailFields,
  AmazonSesNotificationType,
  AmazonSNSEvent,
  AmazonSNSSubscriptionEvent,
  AmazonSNSUnsubscribeEvent,
  BatchTrackData,
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
function guardResponseError(e: unknown): SESServiceException {
  if (e instanceof SESServiceException) {
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
}): Promise<Result<SendEmailCommandOutput, SESServiceException>> {
  const { accessKeyId, secretAccessKey, region } = config;
  const client = new SESClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const replyTo = mailData.replyTo
    ? {
        ReplyToAddresses: [mailData.replyTo],
      }
    : {};

  const tags = mailData.tags
    ? {
        Tags: Object.keys(mailData.tags).reduce(
          (a: MessageTag[], k: string) => {
            return mailData.tags
              ? [{ Name: k, Value: mailData.tags[k] }, ...a]
              : a;
          },
          [],
        ),
      }
    : {};

  const input: SendEmailCommandInput = {
    Source: mailData.from,
    Destination: {
      ToAddresses: [mailData.to],
    },
    Message: {
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
    },
    ...tags,
    ...replyTo,
  };

  const command = new SendEmailCommand(input);

  return ResultAsync.fromPromise(client.send(command), guardResponseError).map(
    (resultArray) => resultArray,
  );
}

export async function submitAmazonSesEvents(
  event: AmazonSesEventPayload,
): Promise<ResultAsync<void, Error>> {
  // TODO: Amazon may batch requests (if we send with multiple To: addresses? or with the BatchTemplated endpoint).  We should map over the receipients.
  logger().debug(event);

  const workspaceId = unwrapTag("workspaceId", event.mail.tags);
  const userId = unwrapTag("userId", event.mail.tags);

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
        batch: items,
        ...R.pick(event.mail.tags, MESSAGE_METADATA_FIELDS),
      },
    }),
    (e) => (e instanceof Error ? e : Error(e as string)),
  );
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
