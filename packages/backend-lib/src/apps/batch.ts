import * as R from "remeda";

import { BatchAppData, EventType } from "../types";
import { InsertUserEvent, insertUserEvents } from "../userEvents";
import { persistFiles } from "./files";

export interface SubmitBatchOptions {
  workspaceId: string;
  data: BatchAppData;
}

export async function buildBatchUserEvents(
  data: BatchAppData,
): Promise<InsertUserEvent[]> {
  const { context, batch } = data;

  const promises = batch.map(async (message) => {
    let rest: Record<string, unknown>;
    let timestamp: string;
    const messageRaw: Record<string, unknown> = { context };

    if (message.type === EventType.Identify) {
      rest = R.omit(message, ["timestamp", "traits"]);
      timestamp = message.timestamp ?? new Date().toISOString();
      messageRaw.traits = message.traits ?? {};
    } else {
      rest = R.omit(message, ["timestamp", "properties"]);
      timestamp = message.timestamp ?? new Date().toISOString();

      const properties = message.properties ?? {};
      messageRaw.properties = properties;
    }

    Object.assign(
      messageRaw,
      {
        timestamp,
      },
      rest,
    );

    return {
      messageId: message.messageId,
      messageRaw: JSON.stringify(messageRaw),
    };
  });
  return Promise.all(promises);
}

export async function submitBatch({ workspaceId, data }: SubmitBatchOptions) {
  const userEvents = await buildBatchUserEvents(data);

  await insertUserEvents({
    workspaceId,
    userEvents,
  });
}
