import { SourceType } from "isomorphic-lib/src/constants";
import { err, ok, Result, ResultAsync } from "neverthrow";
import qs from "querystring";
import { omitBy } from "remeda";
import TwilioClient from "twilio";
import RestException from "twilio/lib/base/RestException";

import { submitBatch } from "../apps/batch";
import config from "../config";
import logger from "../logger";
import {
  BatchTrackData,
  EventType,
  InternalEventType,
  MessageTags,
  SmsProviderType,
  TwilioInboundSchema,
  TwilioMessageStatus,
  TwilioWebhookRequest,
} from "../types";

export const TwilioRestException = RestException;

export interface PhoneNumberSender {
  from: string;
}

export interface MessagingServiceSender {
  messagingServiceSid: string;
}

export type Sender = PhoneNumberSender | MessagingServiceSender;

export async function sendSms({
  body,
  accountSid,
  authToken,
  to,
  subscriptionGroupId,
  userId,
  workspaceId,
  disableCallback = false,
  tags,
  ...sender
}: {
  body: string;
  to: string;
  accountSid: string;
  authToken: string;
  subscriptionGroupId: string | undefined;
  userId: string;
  workspaceId: string;
  disableCallback?: boolean;
  tags?: MessageTags;
} & Sender): Promise<Result<{ sid: string }, RestException | Error>> {
  try {
    let statusCallback: string | undefined;
    if (!disableCallback) {
      const baseCallbackUrl = `${config().dashboardUrl}/api/public/webhooks/twilio`;
      const queryParams = qs.stringify({
        ...omitBy(tags, (_v, key) => key === "channel"),
        subscriptionGroupId,
        userId,
        workspaceId,
      });
      statusCallback = `${baseCallbackUrl}?${queryParams}`;
    }

    const createPayload = {
      ...sender,
      body,
      to,
      statusCallback,
    };
    logger().debug(
      {
        accountSid,
        ...createPayload,
      },
      "Sending SMS",
    );
    const response = await TwilioClient(accountSid, authToken).messages.create(
      createPayload,
    );
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
  ...tags
}: {
  TwilioEvent: TwilioInboundSchema;
} & TwilioWebhookRequest): Promise<ResultAsync<void, Error>> {
  let eventName: InternalEventType;
  const body = TwilioEvent.Body;

  switch (TwilioEvent.SmsStatus) {
    case TwilioMessageStatus.Failed:
      eventName = InternalEventType.SmsFailed;
      break;
    case TwilioMessageStatus.Delivered:
      // TODO wrong
      eventName = InternalEventType.SmsDelivered;
      break;
    default:
      logger().error(
        {
          workspaceId,
          userId,
          TwilioEvent,
        },
        "Unhandled Twilio event type",
      );
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
      body,
      ...tags,
    },
  } as BatchTrackData;

  return ResultAsync.fromPromise(
    submitBatch({
      workspaceId,
      data: {
        context: {
          source: SourceType.Webhook,
          provider: SmsProviderType.Twilio,
        },
        batch: [item],
      },
    }),
    (e) => (e instanceof Error ? e : Error(e as string)),
  );
}
