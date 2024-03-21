import { err, ok, Result, ResultAsync } from "neverthrow";
import TwilioClient from "twilio";
import RestException from "twilio/lib/base/RestException";

import { submitBatch } from "../apps/batch";
import logger from "../logger";
import {
  BatchTrackData,
  EventType,
  InternalEventType,
  TwilioInboundSchema,
  TwilioMessageStatus,
} from "../types";

export const TwilioRestException = RestException;

export async function sendSms({
  body,
  accountSid,
  authToken,
  messagingServiceSid,
  to,
  subscriptionGroupId,
  userId,
  workspaceId,
}: {
  body: string;
  to: string;
  accountSid: string;
  messagingServiceSid: string;
  authToken: string;
  subscriptionGroupId: string | undefined;
  userId: string;
  workspaceId: string;
}): Promise<Result<{ sid: string }, RestException | Error>> {
  try {
    logger().debug(
      {
        accountSid,
        messagingServiceSid,
        body,
        to,
      },
      "Sending SMS",
    );
    // TODO refactor this into the backend config, using just the host not the path
    const statusCallbackBaseURL =
      process.env.TWILIO_STATUS_CALLBACK_URL ??
      "https://dittofeed.com/api/public/webhooks/twilio";

    const response = await TwilioClient(accountSid, authToken).messages.create({
      messagingServiceSid,
      body,
      to,
      statusCallback: `${statusCallbackBaseURL}?subscriptionGroupId=${subscriptionGroupId ?? ""}&userId=${userId}&workspaceId=${workspaceId}`,
    });
    logger().debug({ response }, "SMS sent");
    return ok({ sid: response.sid });
  } catch (e) {
    if (e instanceof RestException) {
      return err(e);
    }
    // unknown error
    const error = e as Error;
    return err(error);
  }
}

export async function submitTwilioEvents({
  workspaceId,
  TwilioEvent,
  userId,
}: {
  workspaceId: string;
  TwilioEvent: TwilioInboundSchema;
  subscriptionGroupId: string | undefined;
  userId: string;
}): Promise<ResultAsync<void, Error>> {
  let eventName: InternalEventType;

  switch (TwilioEvent.SmsStatus) {
    case TwilioMessageStatus.Failed:
      eventName = InternalEventType.SmsFailed;
      break;
    case TwilioMessageStatus.Delivered:
      // TODO wrong
      eventName = InternalEventType.SmsDelivered;
      break;
    default:
      return err(
        new Error(`Unhandled Twilio event type: ${TwilioEvent.SmsStatus}`),
      );
  }

  if (!userId) {
    return err(new Error("Missing userId."));
  }

  const item = {
    type: EventType.Track,
    event: eventName,
    userId,
    messageId: TwilioEvent.MessageSid,
    timestamp: new Date().toISOString(),
    properties: {
      workspaceId,
      userId,
    },
  } as BatchTrackData;

  return ResultAsync.fromPromise(
    submitBatch({
      workspaceId,
      data: {
        batch: [item],
      },
    }),
    (e) => (e instanceof Error ? e : Error(e as string)),
  );
}
