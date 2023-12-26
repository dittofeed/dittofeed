import responseError from "@sendgrid/helpers/classes/response-error";
import sendgridMail from "@sendgrid/mail";
import { err, ok, Result, ResultAsync } from "neverthrow";
import * as R from "remeda";
import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "../apps";
import logger from "../logger";
import {
  BatchAppData,
  BatchItem,
  BatchTrackData,
  EventType,
  InternalEventType,
  SendgridEvent,
} from "../types";

// README the typescript types on this are wrong, body is not of type string,
// it's a parsed JSON object
function guardResponseError(e: unknown): sendgridMail.ResponseError {
  if (e instanceof responseError) {
    return e;
  }
  throw e;
}

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
    guardResponseError
  ).map((resultArray) => resultArray[0]);
}

export function sendgridEventToDF({
  workspaceId,
  sendgridEvent,
}: {
  workspaceId: string;
  sendgridEvent: SendgridEvent;
}): Result<BatchItem, Error> {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { email, event, timestamp, sg_message_id } = sendgridEvent;

  const userOrAnonymousId = sendgridEvent.userId ?? sendgridEvent.anonymousId;
  if (!userOrAnonymousId) {
    return err(new Error("Missing userId or anonymousId."));
  }
  const messageId = uuidv5(sg_message_id, workspaceId);

  let eventName: InternalEventType;
  const properties: Record<string, string> = R.merge(
    { email },
    R.pick(sendgridEvent, [
      "workspaceId",
      "journeyId",
      "runId",
      "messageId",
      "userId",
      "templateId",
      "nodeId",
    ])
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
      anonymousId: sendgridEvent.anonymousId,
      properties,
      messageId,
      timestamp: itemTimestamp,
    };
  } else if (sendgridEvent.anonymousId) {
    item = {
      type: EventType.Track,
      event: eventName,
      anonymousId: sendgridEvent.anonymousId,
      properties,
      messageId,
      timestamp: itemTimestamp,
    };
  } else {
    return err(new Error("Missing userId and anonymousId."));
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
      sendgridEventToDF({ workspaceId, sendgridEvent: e })
        .mapErr((error) => {
          logger().error(
            { err: error },
            "Failed to convert sendgrid event to DF."
          );
          return error;
        })
        .unwrapOr([])
    ),
  };
  await submitBatch({
    workspaceId,
    data,
  });
}
