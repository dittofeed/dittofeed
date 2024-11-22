import mailchimp, {
  MessagesMessage,
  MessagesSendResponse,
} from "@mailchimp/mailchimp_transactional";
import { AxiosError } from "axios";
import { err, ok, Result, ResultAsync } from "neverthrow";

import { submitBatch } from "../apps/batch";
import { getMessageFromInternalMessageSent } from "../deliveries";
import {
  BatchItem,
  BatchTrackData,
  EventType,
  InternalEventType,
  MailChimpEvent,
} from "../types";

type MailChimpResponse = Extract<
  Awaited<ReturnType<mailchimp.ApiClient["messages"]["send"]>>,
  MessagesSendResponse[]
>;

const sendMailWrapper = async (apiKey: string, mailData: MessagesMessage) => {
  const mailchimpClient = mailchimp(apiKey);

  const response = await mailchimpClient.messages.send({ message: mailData });
  if (response instanceof AxiosError) {
    throw new Error(response.message, {
      cause: response.code,
    });
  }
  return response as MailChimpResponse;
};

export async function sendMail({
  apiKey,
  message,
}: {
  apiKey: string;
  message: MessagesMessage;
}): Promise<ResultAsync<MailChimpResponse, AxiosError>> {
  return ResultAsync.fromPromise(
    sendMailWrapper(apiKey, message),
    (error) => error as AxiosError,
  );
}

export async function submitMailChimpEvent({
  workspaceId,
  mailChimpEvent,
}: {
  workspaceId: string;
  mailChimpEvent: MailChimpEvent;
}): Promise<Result<BatchItem, Error>> {
  const { event, msg, ts } = mailChimpEvent;

  const { messageId } = msg.metadata as {
    messageId: string;
  };

  if (!messageId) {
    return err(new Error("Missing message_id"));
  }

  const message = await getMessageFromInternalMessageSent({
    workspaceId,
    messageId,
  });

  if (!message) {
    return err(new Error("Message not found"));
  }

  const { userId, properties } = message;

  let eventName: InternalEventType;

  switch (event) {
    case "open":
      eventName = InternalEventType.EmailOpened;
      break;
    case "click":
      eventName = InternalEventType.EmailClicked;
      break;
    case "hard_bounce":
      eventName = InternalEventType.EmailBounced;
      break;
    case "spam":
      eventName = InternalEventType.EmailMarkedSpam;
      break;
    case "delivered":
      eventName = InternalEventType.EmailDelivered;
      break;
    default:
      return err(new Error(`Unhandled event type: ${event}`));
  }

  const timestamp = new Date(ts * 1000).toISOString();

  const item: BatchTrackData = {
    type: EventType.Track,
    event: eventName,
    messageId,
    timestamp,
    properties,
    anonymousId: userId,
  };

  await submitBatch({
    workspaceId,
    data: {
      batch: [item],
    },
  });

  return ok(item);
}
