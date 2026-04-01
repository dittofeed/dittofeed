import * as R from "remeda";

import config from "../config";
import {
  identifyMessageCreatesIdentityLink,
  readTraitAnonymousForLink,
  reconcileLinkedAnonymousUserTables,
} from "../identityLinks";
import { BatchAppData, EventType, IdentifyData, WriteMode } from "../types";
import { InsertUserEvent, insertUserEvents } from "../userEvents";
import { splitGroupEvents } from "./group";

export interface SubmitBatchOptions {
  workspaceId: string;
  data: BatchAppData;
}

/** Build identify message_raw with top-level anonymousId for ClickHouse (and identity MVs). */
export function buildIdentifyMessageRaw(
  data: IdentifyData,
): Record<string, unknown> {
  const traits = data.traits ?? {};
  const timestamp = data.timestamp ?? new Date().toISOString();
  const rest = R.omit(data, ["timestamp", "traits"]);
  const messageRaw: Record<string, unknown> = {
    type: "identify",
    traits,
    timestamp,
    ...rest,
  };
  if ("userId" in data && data.userId) {
    const fromTraits = readTraitAnonymousForLink(traits);
    if (fromTraits && !messageRaw.anonymousId) {
      messageRaw.anonymousId = fromTraits;
    }
  }
  return messageRaw;
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
    } else if (message.type === EventType.Alias) {
      rest = R.omit(message, ["timestamp", "context"]);
      timestamp = message.timestamp ?? new Date().toISOString();
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

    if (
      message.type === EventType.Identify &&
      "userId" in message &&
      message.userId
    ) {
      const fromTraits = readTraitAnonymousForLink(messageRaw.traits);
      if (fromTraits && !messageRaw.anonymousId) {
        messageRaw.anonymousId = fromTraits;
      }
    }

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
    writeModeOverride,
  }: {
    processingTime?: number;
    writeModeOverride?: WriteMode;
  } = {},
) {
  const userEvents = buildBatchUserEvents(data, { processingTime });

  await insertUserEvents(
    {
      workspaceId,
      userEvents,
    },
    { writeModeOverride },
  );
  // Identity link rows for alias / identify-with-link are populated by ClickHouse MVs on user_events_v2.
  if (
    data.batch.some(
      (m) =>
        m.type === EventType.Alias || identifyMessageCreatesIdentityLink(m),
    )
  ) {
    await reconcileLinkedAnonymousUserTables(workspaceId);
  }
}

export async function submitBatch(
  { workspaceId, data }: SubmitBatchOptions,
  {
    processingTime,
    writeModeOverride,
  }: {
    processingTime?: number;
    writeModeOverride?: WriteMode;
  } = {},
) {
  const { batchChunkSize } = config();
  const chunks = R.chunk(data.batch, batchChunkSize);

  await Promise.all(
    chunks.map(async (chunk) => {
      const chunkData = { ...data, batch: chunk };
      return submitBatchChunk(
        { workspaceId, data: chunkData },
        { processingTime, writeModeOverride },
      );
    }),
  );
}
