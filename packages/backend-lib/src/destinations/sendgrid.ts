import responseError from "@sendgrid/helpers/classes/response-error";
import sendgridMail from "@sendgrid/mail";
import { err, ok, Result, ResultAsync } from "neverthrow";
import * as R from "remeda";
import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "../apps";
import {
  BatchAppData,
  BatchItem,
  BatchTrackData,
  InternalEventType,
  SendgridEvent,
} from "../types";

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
  const { email, event, timestamp, sg_message_id, custom_args } = sendgridEvent;

  if (!custom_args) {
    return err(new Error("Missing custom_args."));
  }
  const userOrAnonymousId = custom_args.userId ?? custom_args.anonymousId;
  if (!userOrAnonymousId) {
    return err(new Error("Missing userId or anonymousId."));
  }
  const messageId = uuidv5(sg_message_id, workspaceId);

  let eventName: InternalEventType;
  const properties: Record<string, string> = R.merge(
    { email },
    R.pick(custom_args, [
      "journeyId",
      "runId",
      "messageId",
      "userId",
      "workspaceId",
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
  if (custom_args.userId) {
    item = {
      type: "track",
      event: eventName,
      userId: custom_args.userId,
      anonymousId: custom_args.anonymousId,
      properties,
      messageId,
      timestamp: itemTimestamp,
    };
  } else if (custom_args.anonymousId) {
    item = {
      type: "track",
      event: eventName,
      anonymousId: custom_args.anonymousId,
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
      sendgridEventToDF({ workspaceId, sendgridEvent: e }).unwrapOr([])
    ),
  };
  await submitBatch({
    workspaceId,
    data,
  });
}
