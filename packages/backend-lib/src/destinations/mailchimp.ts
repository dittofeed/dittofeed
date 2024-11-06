import { SourceType } from "isomorphic-lib/src/constants";
import { err, ok, Result, ResultAsync } from "neverthrow";
import mailchimp, {
  MessagesMessage,
  MessagesSendResponse,
} from "@mailchimp/mailchimp_transactional";

import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "../apps/batch";
import logger from "../logger";
import {
  BatchAppData,
  BatchItem,
  BatchTrackData,
  EmailProviderType,
  EventType,
  InternalEventType,
  MailChimpEvent,
} from "../types";
import { AxiosError } from "axios";

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

export function mailChimpEventToDF({
  workspaceId,
  mailChimpEvent,
}: {
  workspaceId: string;
  mailChimpEvent: MailChimpEvent;
}): Result<BatchItem, Error> {
  const { event, msg, ts } = mailChimpEvent;

  const userId = msg.metadata?.user_id?.toString();
  const userEmail = msg.email;

  if (!userId) {
    return err(new Error("Missing userId"));
  }

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

  const messageId = uuidv5(msg._id, workspaceId);
  const timestamp = new Date(ts * 1000).toISOString();

  const properties = {
    email: userEmail,
    url: mailChimpEvent.url, // Only present for click events
  };

  const item: BatchTrackData = {
    type: EventType.Track,
    event: eventName,
    userId,
    messageId,
    timestamp,
    properties,
  };

  return ok(item);
}

export async function submitMailChimpEvents({
  workspaceId,
  events,
}: {
  workspaceId: string;
  events: MailChimpEvent[];
}) {
  const data: BatchAppData = {
    context: {
      source: SourceType.Webhook,
      provider: EmailProviderType.MailChimp,
    },
    batch: events.flatMap((e) =>
      mailChimpEventToDF({ workspaceId, mailChimpEvent: e })
        .mapErr((error) => {
          logger().error(
            { err: error },
            "Failed to convert MailChimp event to DF.",
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
