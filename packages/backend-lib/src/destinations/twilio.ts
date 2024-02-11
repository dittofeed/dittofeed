import { err, ok, Result } from "neverthrow";
import TwilioClient from "twilio";
import RestException from "twilio/lib/base/RestException";

import logger from "../logger";
import { submitBatch } from "../apps";
import { BatchAppData, BatchItem, BatchTrackData, ChannelType, EventType, SubscriptionGroupResource, SubscriptionGroupType, TwilioInboundSchema, TwilioMessageStatus } from "../types";

export const TwilioRestException = RestException;

export async function sendSms({
  body,
  accountSid,
  authToken,
  messagingServiceSid,
  to,
}: {
  body: string;
  to: string;
  accountSid: string;
  messagingServiceSid: string;
  authToken: string;
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
    const response = await TwilioClient(accountSid, authToken).messages.create({
      messagingServiceSid,
      body,
      to,
      // TODO add callback with query params to denote identity of message
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



export function TwilioEventToDF({
  workspaceId,
  TwilioEvent,
}: {
  workspaceId: string;
  TwilioEvent: TwilioInboundSchema;
}): Result<BatchItem, Error> {

  const messageBody = TwilioEvent.Body.toLowerCase();
  const MessageStatus = TwilioEvent.SmsStatus;
  const subscriptionStatus = messageBody.includes('stop') ? SubscriptionGroupType.OptOut : messageBody.includes('start') ? SubscriptionGroupType.OptIn : null;

  let item: BatchTrackData;
  let item2: SubscriptionGroupResource;
  if (TwilioEvent.userId) {
    item = {
      type: EventType.Track,
      event: eventName,
      userId: TwilioEvent.userId,
      anonymousId: TwilioEvent.anonymousId,
      properties,
      messageId,
      timestamp: itemTimestamp,
    };
  } else if (TwilioEvent.anonymousId) {
    item = {
      type: EventType.Track,
      event: eventName,
      anonymousId: TwilioEvent.anonymousId,
      properties,
      messageId,
      timestamp: itemTimestamp,
    };
    if (subscriptionStatus) { 
      item2 = {
        type: subscriptionStatus,
        workspaceId,
        id,
        name: `Subscription Group - ${id}`,
        channel: ChannelType.Sms,
      };
    }
  } else {
    return err(new Error("Missing userId and anonymousId."));
  }

  return ok(item);
}

export async function submitTwilioEvents({
  workspaceId,
  events,
}: {
  workspaceId: string;
  events: TwilioInboundSchema[];
}) {
  const data: BatchAppData = {
    batch: events.flatMap((e) =>
      TwilioEventToDF({ workspaceId, TwilioEvent: e })
        .mapErr((error) => {
          logger().error(
            { err: error },
            "Failed to convert Twilio event to DF.",
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
