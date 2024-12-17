import mailchimp, {
  MessagesMessage,
  MessagesSendRejectResponse,
  MessagesSendSuccessResponse,
} from "@mailchimp/mailchimp_transactional";
import { AxiosError } from "axios";
import { err, ok, Result, ResultAsync } from "neverthrow";

import { submitBatch } from "../apps/batch";
import { getMessageFromInternalMessageSent } from "../deliveries";
import logger from "../logger";
import {
  BatchItem,
  BatchTrackData,
  EventType,
  InternalEventType,
  MailChimpEvent,
} from "../types";

export async function sendMail({
  apiKey,
  message,
}: {
  apiKey: string;
  message: MessagesMessage;
}): Promise<
  ResultAsync<
    MessagesSendSuccessResponse,
    AxiosError | MessagesSendRejectResponse
  >
> {
  const mailchimpClient = mailchimp(apiKey);
  const response = await mailchimpClient.messages.send({ message });
  if (response instanceof AxiosError) {
    logger().error(
      {
        err: response,
        message,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        workspaceId: message.metadata?.workspaceId,
      },
      "Error sending mailchimp email",
    );
    return err(response);
  }
  const [firstResponse] = response;
  if (!firstResponse) {
    throw new Error("No response from Mailchimp");
  }
  switch (firstResponse.status) {
    case "rejected":
      return err(firstResponse);
    default:
      return ok(firstResponse);
  }
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
