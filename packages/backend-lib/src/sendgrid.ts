/* eslint-disable @typescript-eslint/naming-convention */
import { ok, Result } from "neverthrow";

import { submitBatch } from "./apps";
import { BatchAppData, BatchItem, SendgridEvent } from "./types";
import { InsertUserEvent, insertUserEvents } from "./userEvents";

export function sendgridEventToDF({
  workspaceId,
  sendgridEvent,
}: {
  workspaceId: string;
  sendgridEvent: SendgridEvent;
}): Result<BatchItem, Error> {
  const { email, event, timestamp, sg_message_id } = sendgridEvent;

  const insertUserEvent: InsertUserEvent = {
    messageId: sg_message_id,
    // messageRaw: {
    //   // email,
    //   // event,
    //   // timestamp,
    // },
  };

  return ok(insertUserEvent);
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
