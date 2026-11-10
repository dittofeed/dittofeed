import * as R from "remeda";

import { submitBatch, SubmitBatchOptions } from "./apps/batch";
import { persistFiles } from "./apps/files";
import { splitGroupEvents } from "./apps/group";
import { submitTrack } from "./apps/track";
import { recordCatalogItemInterests } from "./catalogInterests";
import {
  triggerEventEntryJourneys,
  TriggerEventEntryJourneysOptions,
} from "./journeys";
import logger from "./logger";
import {
  BatchItem,
  EventType,
  GroupData,
  IdentifyData,
  PageData,
  ScreenData,
  TrackData,
} from "./types";
import { InsertUserEvent, insertUserEvents } from "./userEvents";

/**
 * Catalog interest is a side effect of tracking, never a reason for it to fail.
 *
 * A workspace that has not created a catalog yet still sends `$items` in its
 * ecommerce events; that must be a no-op, not a 500 on the ingest endpoint.
 */
async function recordInterestsBestEffort(
  input: Parameters<typeof recordCatalogItemInterests>[0],
) {
  try {
    await recordCatalogItemInterests(input);
  } catch (error) {
    logger().error({ err: error }, "Failed to record catalog item interest");
  }
}

export async function submitIdentify({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: IdentifyData;
}) {
  const rest = R.omit(data, ["timestamp", "traits"]);
  const traits = data.traits ?? {};
  const timestamp = data.timestamp ?? new Date().toISOString();

  const userEvent: InsertUserEvent = {
    messageRaw: JSON.stringify({
      type: "identify",
      traits,
      timestamp,
      ...rest,
    }),
    messageId: data.messageId,
  };
  await insertUserEvents({
    workspaceId,
    userEvents: [userEvent],
  });
}

export async function submitTrackWithTriggers({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: TrackData;
}) {
  let properties = data.properties ?? {};
  if (data.files) {
    properties = await persistFiles({
      files: data.files,
      messageId: data.messageId,
      properties,
      workspaceId,
    });
  }

  await submitTrack({
    workspaceId,
    data: {
      ...data,
      properties,
    },
  });

  const trackedUserId = "userId" in data ? data.userId : data.anonymousId;
  await recordInterestsBestEffort({
    workspaceId,
    userId: trackedUserId,
    event: data.event,
    properties,
    timestamp: data.timestamp,
  });

  let userOrAnonymousId: string | null = null;
  if ("userId" in data) {
    userOrAnonymousId = data.userId;
  } else if ("anonymousId" in data) {
    userOrAnonymousId = data.anonymousId;
  }

  if (userOrAnonymousId) {
    await triggerEventEntryJourneys({
      workspaceId,
      event: {
        ...data,
        properties,
      },
      userId: userOrAnonymousId,
    });
  }
}

export async function submitBatchWithTriggers({
  workspaceId,
  data: unprocessedData,
}: SubmitBatchOptions) {
  const batch = await Promise.all(
    unprocessedData.batch.map(async (message) => {
      if (message.type !== EventType.Track || !message.files?.length) {
        return message;
      }
      const properties = await persistFiles({
        files: message.files,
        messageId: message.messageId,
        properties: message.properties ?? {},
        workspaceId,
      });
      return {
        ...message,
        timestamp: message.timestamp ?? new Date().toISOString(),
        properties,
      };
    }),
  );
  const data = {
    ...unprocessedData,
    batch,
  };
  await submitBatch({ workspaceId, data });

  // Interest rows are derived from the same payloads, so a batch that carries
  // item references records them in one extra statement per item rather than
  // one per message.
  const interestInputs = data.batch.flatMap((message) => {
    if (message.type !== EventType.Track) {
      return [];
    }
    const userId = "userId" in message ? message.userId : message.anonymousId;
    return [
      {
        workspaceId,
        userId,
        event: message.event,
        properties: message.properties,
        timestamp: message.timestamp,
      },
    ];
  });
  await Promise.all(
    interestInputs.map((input) =>
      recordInterestsBestEffort(input).catch(() => undefined),
    ),
  );

  const triggers: TriggerEventEntryJourneysOptions[] = data.batch.flatMap(
    (message) => {
      if (message.type !== EventType.Track) {
        return [];
      }
      let userOrAnonymousId: string | null = null;
      if ("userId" in message) {
        userOrAnonymousId = message.userId;
      } else if ("anonymousId" in message) {
        userOrAnonymousId = message.anonymousId;
      }
      if (!userOrAnonymousId) {
        return [];
      }
      return {
        workspaceId,
        event: message,
        userId: userOrAnonymousId,
      } satisfies TriggerEventEntryJourneysOptions;
    },
  );

  await Promise.all(
    triggers.map((trigger) => triggerEventEntryJourneys(trigger)),
  );
}

export async function submitPage({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: PageData;
}) {
  const rest = R.omit(data, ["timestamp", "properties"]);
  const properties = data.properties ?? {};
  const timestamp = data.timestamp ?? new Date().toISOString();

  const userEvent: InsertUserEvent = {
    messageRaw: JSON.stringify({
      type: "page",
      properties,
      timestamp,
      ...rest,
    }),
    messageId: data.messageId,
  };
  await insertUserEvents({
    workspaceId,
    userEvents: [userEvent],
  });
}

export async function submitScreen({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: ScreenData;
}) {
  const rest = R.omit(data, ["timestamp", "properties"]);
  const properties = data.properties ?? {};
  const timestamp = data.timestamp ?? new Date().toISOString();

  const userEvent: InsertUserEvent = {
    messageRaw: JSON.stringify({
      type: "screen",
      properties,
      timestamp,
      ...rest,
    }),
    messageId: data.messageId,
  };
  await insertUserEvents({
    workspaceId,
    userEvents: [userEvent],
  });
}

export async function submitGroup({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: GroupData;
}) {
  const batch = splitGroupEvents(data) satisfies BatchItem[];
  await submitBatch({ workspaceId, data: { batch, context: data.context } });
}
