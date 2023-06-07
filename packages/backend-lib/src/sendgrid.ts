/* eslint-disable @typescript-eslint/naming-convention */
import { err, ok, Result } from "neverthrow";
import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "./apps";
import {
  BatchAppData,
  BatchItem,
  BatchTrackData,
  SendgridEvent,
} from "./types";
import { InsertUserEvent, insertUserEvents } from "./userEvents";

export function sendgridEventToDF({
  workspaceId,
  sendgridEvent,
}: {
  workspaceId: string;
  sendgridEvent: SendgridEvent;
}): Result<BatchItem, Error> {
  const { email, event, timestamp, sg_message_id, custom_args } = sendgridEvent;
  if (!custom_args) {
    return err(new Error("Missing custom_args."));
  }
  if (!custom_args.userId) {
    return err(new Error("Missing custom_args.userId."));
  }
  const messageId = uuidv5(sg_message_id, workspaceId);

  let eventName: string;
  const properties: Record<string, string> = {
    email,
  };

  const item: BatchTrackData = {
    type: "track",
    event: eventName,
    properties,
    messageId,
    timestamp: new Date(timestamp * 1000).toISOString(),
  };

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
