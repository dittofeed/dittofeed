import responseError from "@sendgrid/helpers/classes/response-error";
import sendgridMail from "@sendgrid/mail";
import { and, eq } from "drizzle-orm";
import { SecretNames } from "isomorphic-lib/src/constants";
import {
  jsonParseSafeWithSchema,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result, ResultAsync } from "neverthrow";
import * as R from "remeda";
import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "../apps/batch";
import { MESSAGE_METADATA_FIELDS } from "../constants";
import { verifyTimestampedSignature } from "../crypto";
import { db } from "../db";
import * as schema from "../db/schema";
import logger from "../logger";
import {
  BatchAppData,
  BatchItem,
  BatchTrackData,
  EventType,
  InternalEventType,
  MessageMetadataFields,
  SendgridEvent,
  SendgridSecret,
} from "../types";
import { findUserEventsById } from "../userEvents";

// README the typescript types on this are wrong, body is not of type string,
// it's a parsed JSON object
function guardResponseError(e: unknown): sendgridMail.ResponseError {
  if (e instanceof responseError) {
    return e;
  }
  throw e;
}

export const SENDGRID_ID_HEADER = "smtp-id";

export async function sendMail({
  apiKey,
  mailData,
}: {
  apiKey: string;
  mailData: sendgridMail.MailDataRequired;
}): Promise<
  Result<sendgridMail.ClientResponse | null, sendgridMail.ResponseError>
> {
  sendgridMail.setApiKey(apiKey);

  return ResultAsync.fromPromise(
    sendgridMail.send(mailData),
    guardResponseError,
  ).map((resultArray) => resultArray[0]);
}

type RelevantSendgridFields = Pick<
  SendgridEvent,
  | "email"
  | "event"
  | "timestamp"
  | "userId"
  | "smtp-id"
  | "workspaceId"
  | "broadcastId"
  | "journeyId"
  | "runId"
  | "messageId"
  | "templateId"
  | "nodeId"
  | "sg_message_id"
>;

export function sendgridEventToDF({
  sendgridEvent,
}: {
  sendgridEvent: RelevantSendgridFields;
}): Result<BatchItem, Error> {
  const {
    email,
    event,
    timestamp,
    "smtp-id": smtpId,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    sg_message_id,
  } = sendgridEvent;

  const { userId } = sendgridEvent;
  if (!userId) {
    return err(new Error("Missing userId or anonymousId."));
  }
  // We have need to use the smtp-id as the messageId for two reasons:
  // 1. the sg message id is not present for all events, particularly async
  // events like spam and bounces
  // 2. we need to be able to lookup prior processed events by their smtp-id
  // when we receive async events
  let messageId: string;
  switch (event) {
    case "processed":
      messageId = `processed:${smtpId}`;
      break;
    case "bounce":
      messageId = `bounce:${smtpId}`;
      break;
    case "spamreport":
      messageId = `spamreport:${smtpId}`;
      break;
    default: {
      if (!sendgridEvent.workspaceId || !sg_message_id) {
        return err(
          new Error(
            `Missing workspaceId or sg_message_id for event: ${event}.`,
          ),
        );
      }
      messageId = uuidv5(sg_message_id, sendgridEvent.workspaceId);
      break;
    }
  }

  let eventName: InternalEventType;
  const properties: Record<string, string> = R.merge(
    { email, smtpId },
    R.pick(sendgridEvent, MESSAGE_METADATA_FIELDS),
  );

  switch (event) {
    case "open":
      eventName = InternalEventType.EmailOpened;
      break;
    case "click":
      eventName = InternalEventType.EmailClicked;
      break;
    case "bounce":
      eventName = InternalEventType.EmailBounced;
      break;
    case "dropped":
      eventName = InternalEventType.EmailDropped;
      break;
    case "spamreport":
      eventName = InternalEventType.EmailMarkedSpam;
      break;
    case "delivered":
      eventName = InternalEventType.EmailDelivered;
      break;
    case "processed":
      eventName = InternalEventType.EmailProcessed;
      break;
    default:
      return err(new Error(`Unhandled event type: ${event}`));
  }

  const itemTimestamp = new Date(timestamp * 1000).toISOString();
  let item: BatchTrackData;
  if (sendgridEvent.userId) {
    item = {
      type: EventType.Track,
      event: eventName,
      userId: sendgridEvent.userId,
      properties,
      messageId,
      timestamp: itemTimestamp,
    };
  } else {
    return err(new Error("Missing userId."));
  }

  return ok(item);
}

export async function submitSendgridEvents({
  workspaceId,
  events,
}: {
  workspaceId: string;
  events: SendgridEvent[];
}) {
  const data: BatchAppData = {
    batch: events.flatMap((e) =>
      sendgridEventToDF({ sendgridEvent: e })
        .mapErr((error) => {
          logger().error(
            { err: error },
            "Failed to convert sendgrid event to DF.",
          );
          return error;
        })
        .unwrapOr([]),
    ),
  };
  await submitBatch({
    workspaceId,
    data,
  });
}

export async function handleSendgridEvents({
  sendgridEvents,
  webhookSignature,
  webhookTimestamp,
  rawBody,
}: {
  sendgridEvents: SendgridEvent[];
  webhookSignature: string;
  webhookTimestamp: string;
  rawBody?: string | Buffer;
}): Promise<Result<void, { message: string }>> {
  // - find first workspaceId in custom args of events
  // - if no workspace id is present, lookup all events by their smtp-id as
  // messageId. there should be processed events which contain the critical
  // custom args
  // - if the events aren't found skip them.
  // - if none have a workspace id, return an error
  let workspaceId: string | undefined;
  for (const event of sendgridEvents) {
    if (event.workspaceId) {
      workspaceId = event.workspaceId;
      break;
    }
  }
  const immediateEvents: SendgridEvent[] = [];
  const delayedEvents = new Map<string, SendgridEvent>();

  for (const event of sendgridEvents) {
    switch (event.event) {
      case "spamreport":
      case "bounce":
        delayedEvents.set(event["smtp-id"], event);
        break;
      default:
        immediateEvents.push(event);
        break;
    }
  }

  const processedForDelayedEvents = await findUserEventsById({
    messageIds: Array.from(delayedEvents.keys()).map((id) => `processed:${id}`),
  });

  const backfilledDelayedEvents: SendgridEvent[] = [];

  for (const event of processedForDelayedEvents) {
    const smtpId = event.message_id.split(":")[1];
    if (!smtpId) {
      continue;
    }
    const delayedEvent = delayedEvents.get(smtpId);
    if (!delayedEvent) {
      continue;
    }
    const parsedProperties = jsonParseSafeWithSchema(
      event.properties,
      MessageMetadataFields,
    );
    if (parsedProperties.isErr()) {
      continue;
    }
    const { workspaceId: processedWorkspaceId, userId } =
      parsedProperties.value;
    if (!processedWorkspaceId || !userId) {
      continue;
    }
    if (!workspaceId) {
      workspaceId = processedWorkspaceId;
    }
    if (workspaceId !== processedWorkspaceId) {
      continue;
    }

    // - for those events without the custom args set, set their values
    backfilledDelayedEvents.push({
      ...delayedEvent,
      ...parsedProperties.value,
    });
  }

  // If there are no events to process, return early.
  if (immediateEvents.length === 0 && backfilledDelayedEvents.length === 0) {
    return ok(undefined);
  }

  // If there are events to process, but no workspaceId, that means that we're
  // missing the critical custom args on an immediate event.
  if (!workspaceId) {
    return err({ message: "No workspaceId found in events." });
  }

  // - lookup the webhook secret for the workspace id
  const secret = await db().query.secret.findFirst({
    where: and(
      eq(schema.secret.workspaceId, workspaceId),
      eq(schema.secret.name, SecretNames.SendGrid),
    ),
  });
  const webhookKey = schemaValidateWithErr(secret?.configValue, SendgridSecret)
    .map((val) => val.webhookKey)
    .unwrapOr(null);

  if (!webhookKey) {
    return err({ message: "Missing secret." });
  }

  // - use the webhook signature and timestamp to verify the request
  const publicKey = `-----BEGIN PUBLIC KEY-----\n${webhookKey}\n-----END PUBLIC KEY-----`;

  if (!rawBody || typeof rawBody !== "string") {
    logger().error({ workspaceId }, "Missing rawBody on sendgrid webhook.");
    throw new Error("Missing rawBody on sendgrid webhook.");
  }

  const verified = verifyTimestampedSignature({
    signature: webhookSignature,
    timestamp: webhookTimestamp,
    payload: rawBody,
    publicKey,
  });

  if (!verified) {
    return err({ message: "Invalid signature." });
  }

  // - translate events to DF events and write them
  await submitSendgridEvents({
    workspaceId,
    events: [...immediateEvents, ...backfilledDelayedEvents],
  });

  return ok(undefined);
}
