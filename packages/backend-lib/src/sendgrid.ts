/* eslint-disable @typescript-eslint/naming-convention */
import { ok, Result } from "neverthrow";

import { SendgridEvent } from "./types";
import { InsertUserEvent, insertUserEvents } from "./userEvents";

export function sendgridEventToDF({
  workspaceId,
  sendgridEvent,
}: {
  workspaceId: string;
  sendgridEvent: SendgridEvent;
}): Result<InsertUserEvent, Error> {
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
}: {
  workspaceId: string;
  sendgridEvents: SendgridEvent[];
}) {}
