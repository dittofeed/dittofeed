import { SourceType } from "isomorphic-lib/src/constants";
import { err, ok, Result } from "neverthrow";
import * as R from "remeda";
import { ErrorResponse, Resend } from "resend";
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
  ResendEvent,
  ResendEventType,
} from "../types";

export type ResendRequiredData = Parameters<Resend["emails"]["send"]>["0"];
export type ResendResponse = Awaited<ReturnType<Resend["emails"]["send"]>>;

export async function sendMail({
  apiKey,
  mailData,
}: {
  apiKey: string;
  mailData: ResendRequiredData;
}): Promise<Result<ResendResponse, ErrorResponse>> {
  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send(mailData);
    if (response.error) {
      logger().error(
        {
          errorName: response.error.name,
          errorMessage: response.error.message,
          to: mailData.to,
          from: mailData.from,
          subject: mailData.subject,
        },
        "Resend API returned an error",
      );
      return err(response.error);
    }
    return ok(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger().error(
      {
        err: e,
        to: mailData.to,
        from: mailData.from,
        subject: mailData.subject,
      },
      "Resend send threw an unexpected error",
    );
    return err({
      message,
      name: "application_error",
    });
  }
}

export function resendEventToDF({
  workspaceId,
  resendEvent,
}: {
  workspaceId: string;
  resendEvent: ResendEvent;
}): Result<BatchItem, Error> {
  const { type: event } = resendEvent;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { created_at, email_id, to } = resendEvent.data;

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const email = to[0]!;

  const { userId } = resendEvent.data.tags;
  if (!userId) {
    return err(new Error("Missing userId or anonymousId."));
  }
  const messageId = uuidv5(`${event}:${email_id}`, workspaceId);

  let eventName: InternalEventType;

  switch (event) {
    case ResendEventType.Opened:
      eventName = InternalEventType.EmailOpened;
      break;
    case ResendEventType.Clicked:
      eventName = InternalEventType.EmailClicked;
      break;
    case ResendEventType.Bounced:
      eventName = InternalEventType.EmailBounced;
      break;
    case ResendEventType.DeliveryDelayed:
      eventName = InternalEventType.EmailDropped;
      break;
    case ResendEventType.Complained:
      eventName = InternalEventType.EmailMarkedSpam;
      break;
    case ResendEventType.Delivered:
      eventName = InternalEventType.EmailDelivered;
      break;
    default:
      return err(new Error(`Unhandled event type: ${event}`));
  }

  const timestamp = new Date(created_at).toISOString();
  const properties: Record<string, string> = R.merge(
    { email },
    R.pick(resendEvent.data.tags, MESSAGE_METADATA_FIELDS),
  );
  let item: BatchTrackData;
  if (userId) {
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

export async function submitResendEvents({
  workspaceId,
  events,
}: {
  workspaceId: string;
  events: ResendEvent[];
}) {
  const data: BatchAppData = {
    context: {
      source: SourceType.Webhook,
      provider: EmailProviderType.Resend,
    },
    batch: events.flatMap((e) =>
      resendEventToDF({ workspaceId, resendEvent: e })
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
