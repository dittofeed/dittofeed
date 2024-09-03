// postmark doesn't directly exports the types we need
/* eslint-disable import/no-extraneous-dependencies */
import { SourceType } from "isomorphic-lib/src/constants";
import { err, ok, Result, ResultAsync } from "neverthrow";
import { Message, ServerClient } from "postmark";
import { DefaultResponse } from "postmark/dist/client/models/client/DefaultResponse";
import { MessageSendingResponse } from "postmark/dist/client/models/message/Message";
import * as R from "remeda";
import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "../apps/batch";
import { MESSAGE_METADATA_FIELDS } from "../constants";
import logger from "../logger";
import {
  BatchAppData,
  BatchItem,
  BatchTrackData,
  EmailProviderType,
  EventType,
  InternalEventType,
  PostMarkEvent,
  PostMarkEventType,
} from "../types";

function guardResponseError(payload: unknown): DefaultResponse {
  const error = payload as Error;
  return {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    ErrorCode: (error.cause as DefaultResponse["ErrorCode"]) ?? "",
    Message: error.message,
  };
}

/* 
Postmarks's client does not throw an error and instead returns a nullish error 
object that's why we wrap it out in our wrapper function
*/

const sendMailWrapper = async (apiKey: string, mailData: Message) => {
  const postmarkClient = new ServerClient(apiKey);

  const response = await postmarkClient.sendEmail(mailData);
  if (response.ErrorCode) {
    throw new Error(response.Message, {
      cause: response.ErrorCode,
    });
  }
  return response;
};

export async function sendMail({
  apiKey,
  mailData,
}: {
  apiKey: string;
  mailData: Message;
}): Promise<ResultAsync<MessageSendingResponse, DefaultResponse>> {
  return ResultAsync.fromPromise(
    sendMailWrapper(apiKey, mailData),
    guardResponseError,
  ).map((resultArray) => resultArray);
}

function unwrapTag(tagName: string, tags: Record<string, string>) {
  return tags[tagName] ?? null;
}

export function postMarkEventToDF({
  workspaceId,
  postMarkEvent,
}: {
  workspaceId: string;
  postMarkEvent: PostMarkEvent;
}): Result<BatchItem, Error> {
  const {
    RecordType: event,
    Metadata,
    DeliveredAt,
    ReceivedAt,
    BouncedAt,
  } = postMarkEvent;

  const userId = unwrapTag("userId", Metadata);
  const userEmail = unwrapTag("recipient", Metadata);

  if (!userId) {
    return err(new Error("Missing userId"));
  }

  let eventName: InternalEventType;
  let timestamp: string | undefined;

  switch (event) {
    case PostMarkEventType.Open:
      eventName = InternalEventType.EmailOpened;
      timestamp = ReceivedAt;
      break;
    case PostMarkEventType.Click:
      eventName = InternalEventType.EmailClicked;
      timestamp = ReceivedAt;
      break;
    case PostMarkEventType.Bounce:
      eventName = InternalEventType.EmailBounced;
      timestamp = BouncedAt;
      break;
    case PostMarkEventType.SpamComplaint:
      eventName = InternalEventType.EmailMarkedSpam;
      timestamp = BouncedAt;
      break;
    case PostMarkEventType.Delivery:
      eventName = InternalEventType.EmailDelivered;
      timestamp = DeliveredAt;
      break;
    default:
      return err(new Error(`Unhandled event type: ${event as string}`));
  }

  if (!timestamp || !userEmail) {
    return err(new Error("Missing timestamp or userEmail"));
  }

  const messageId = uuidv5(postMarkEvent.MessageID, workspaceId);

  let item: BatchTrackData;
  if (userId) {
    const properties = {
      email: userEmail,
      ...R.pick(Metadata, MESSAGE_METADATA_FIELDS),
    };
    item = {
      type: EventType.Track,
      event: eventName,
      userId,
      messageId,
      timestamp,
      properties,
    };
  } else {
    return err(new Error("Missing userId and anonymousId."));
  }

  return ok(item);
}

export async function submitPostmarkEvents({
  workspaceId,
  events,
}: {
  workspaceId: string;
  events: PostMarkEvent[];
}) {
  const data: BatchAppData = {
    context: {
      source: SourceType.Webhook,
      provider: EmailProviderType.PostMark,
    },
    batch: events.flatMap((e) =>
      postMarkEventToDF({ workspaceId, postMarkEvent: e })
        .mapErr((error) => {
          logger().error(
            { err: error },
            "Failed to convert resend event to DF.",
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
