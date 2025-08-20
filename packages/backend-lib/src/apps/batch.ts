import * as R from "remeda";

import config from "../config";
import { BatchAppData, EventType } from "../types";
import { InsertUserEvent, insertUserEvents } from "../userEvents";
import { splitGroupEvents } from "./group";

export interface SubmitBatchOptions {
  workspaceId: string;
  data: BatchAppData;
}

export function buildBatchUserEvents(
  data: BatchAppData,
  {
    // allow processing time to be provided for testing
    processingTime,
  }: {
    processingTime?: number;
  } = {},
): InsertUserEvent[] {
  const { context, batch } = data;
  const batchWithMappedGroupEvents = batch.flatMap((message) =>
    message.type === EventType.Group ? splitGroupEvents(message) : message,
  );

  return batchWithMappedGroupEvents.map((message) => {
    let rest: Record<string, unknown>;
    let timestamp: string;

    const mergedContext = {
      ...context,
      ...message.context,
    };
    const messageRaw: Record<string, unknown> = { context: mergedContext };

    if (message.type === EventType.Identify) {
      rest = R.omit(message, ["timestamp", "traits", "context"]);
      timestamp = message.timestamp ?? new Date().toISOString();
      messageRaw.traits = message.traits ?? {};
    } else {
      rest = R.omit(message, ["timestamp", "properties", "context"]);
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
      processingTime: processingTime
        ? new Date(processingTime).toISOString()
        : undefined,
      serverTime: new Date().toISOString(),
    };
  });
}

export async function submitBatchChunk(
  { workspaceId, data }: SubmitBatchOptions,
  {
    processingTime,
  }: {
    processingTime?: number;
  } = {},
) {
  const userEvents = buildBatchUserEvents(data, { processingTime });

  await insertUserEvents({
    workspaceId,
    userEvents,
  });
}

export async function submitBatch(
  { workspaceId, data }: SubmitBatchOptions,
  {
    processingTime,
  }: {
    processingTime?: number;
  } = {},
) {
  const { batchChunkSize } = config();
  const chunks = R.chunk(data.batch, batchChunkSize);

  await Promise.all(
    chunks.map(async (chunk) => {
      const chunkData = { ...data, batch: chunk };
      return submitBatchChunk(
        { workspaceId, data: chunkData },
        { processingTime },
      );
    }),
  );
}
