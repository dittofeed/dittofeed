import { err, ok, Result, ResultAsync } from "neverthrow";
import TwilioClient from "twilio";
import RestException from "twilio/lib/base/RestException";

import { submitBatch } from "../apps";
import logger from "../logger";
import { updateUserSubscriptions } from "../subscriptionGroups";
import {
  BatchTrackData,
  EventType,
  InternalEventType,
  SubscriptionGroupType,
  TwilioInboundSchema,
  TwilioMessageStatus,
} from "../types";
import { findUserIdByMessageId } from "../userEvents";

export const TwilioRestException = RestException;

export async function sendSms({
  body,
  accountSid,
  authToken,
  messagingServiceSid,
  to,
  subscriptionGroupId,
}: {
  body: string;
  to: string;
  accountSid: string;
  messagingServiceSid: string;
  authToken: string;
  subscriptionGroupId: string | undefined;
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
    const statusCallbackBaseURL =
      process.env.TWILIO_STATUS_CALLBACK_URL ??
      "https://dittofeed.com/api/public/webhooks/twilio";

    const response = await TwilioClient(accountSid, authToken).messages.create({
      messagingServiceSid,
      body,
      to,
      statusCallback: `${statusCallbackBaseURL}?subscriptionGroupId=${subscriptionGroupId ?? ""}`,
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
  subscriptionGroupId,
}: {
  workspaceId: string;
  TwilioEvent: TwilioInboundSchema;
  subscriptionGroupId: string | undefined;
}): Promise<ResultAsync<void, Error>> {
  const messageBody = TwilioEvent.Body.toLowerCase();

  let subscriptionStatus = null;
  if (messageBody.includes("stop")) {
    subscriptionStatus = SubscriptionGroupType.OptOut;
  } else if (messageBody.includes("start")) {
    subscriptionStatus = SubscriptionGroupType.OptIn;
  }

  let eventName: InternalEventType;

  switch (TwilioEvent.SmsStatus) {
    case TwilioMessageStatus.Failed:
      eventName = InternalEventType.MessageFailure;
      break;
    case TwilioMessageStatus.Delivered:
      eventName = InternalEventType.MessageSent;
      break;
    default:
      return err(
        new Error(`Unhandled Twilio event type: ${TwilioEvent.SmsStatus}`),
      );
  }

  const userId = await findUserIdByMessageId({
    messageId: TwilioEvent.MessageSid,
    workspaceId,
  });

  if (!userId || !subscriptionStatus) {
    return err(new Error("Missing userId and anonymousId."));
  }

  const item = {
    type: EventType.Track,
    event: eventName,
    userId,
    messageId: TwilioEvent.MessageSid,
    timestamp: new Date().toString(),
    properties: {
      workspaceId,
      userId,
    },
  } as BatchTrackData;

  if (subscriptionGroupId) {
    await updateUserSubscriptions({
      workspaceId,
      userId,
      changes: {
        [subscriptionGroupId]: true,
      },
    });
  }

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
