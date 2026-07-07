import * as R from "remeda";

import { submitBatch, SubmitBatchOptions } from "./apps/batch";
import { persistFiles } from "./apps/files";
import { splitGroupEvents } from "./apps/group";
import { submitTrack } from "./apps/track";
import {
  triggerEventEntryJourneys,
  TriggerEventEntryJourneysOptions,
} from "./journeys";
import { materializeRealtimeUserProperties } from "./realtimeUserProperties/materialize";
import {
  BatchItem,
  EventType,
  GroupData,
  IdentifyData,
  JSONValue,
  PageData,
  ScreenData,
  TrackData,
} from "./types";
import { InsertUserEvent, insertUserEvents } from "./userEvents";

interface TrackTrigger {
  event: TrackData;
  userId: string;
  workspaceId: string;
}

function trackJobPayload({
  data,
  properties,
}: {
  data: TrackData;
  properties: Record<string, JSONValue>;
}): Record<string, JSONValue> {
  return {
    event: data.event,
    messageId: data.messageId,
    properties,
    timestamp: data.timestamp ?? null,
    type: EventType.Track,
    userId: "userId" in data ? data.userId : null,
    anonymousId: "anonymousId" in data ? data.anonymousId : null,
  };
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

  let userOrAnonymousId: string | null = null;
  if ("userId" in data) {
    userOrAnonymousId = data.userId;
  } else if ("anonymousId" in data) {
    userOrAnonymousId = data.anonymousId;
  }

  if (userOrAnonymousId) {
    await materializeRealtimeUserProperties({
      job: {
        anonymousId: "anonymousId" in data ? data.anonymousId : undefined,
        event: data.event,
        eventTime: new Date(data.timestamp ?? new Date().toISOString()),
        eventType: EventType.Track,
        messageId: data.messageId,
        payload: trackJobPayload({ data, properties }),
        userId: "userId" in data ? data.userId : undefined,
        userOrAnonymousId,
        workspaceId,
      },
    });
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

  const triggers: TrackTrigger[] = data.batch.flatMap((message) => {
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
    } satisfies TrackTrigger;
  });

  await Promise.all(
    triggers.map(async (trigger) => {
      await materializeRealtimeUserProperties({
        job: {
          anonymousId:
            "anonymousId" in trigger.event
              ? trigger.event.anonymousId
              : undefined,
          event: trigger.event.event,
          eventTime: new Date(
            trigger.event.timestamp ?? new Date().toISOString(),
          ),
          eventType: EventType.Track,
          messageId: trigger.event.messageId,
          payload: trackJobPayload({
            data: trigger.event,
            properties: trigger.event.properties ?? {},
          }),
          userId: "userId" in trigger.event ? trigger.event.userId : undefined,
          userOrAnonymousId: trigger.userId,
          workspaceId: trigger.workspaceId,
        },
      });
      return triggerEventEntryJourneys(
        trigger satisfies TriggerEventEntryJourneysOptions,
      );
    }),
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
