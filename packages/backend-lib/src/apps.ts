import * as R from "remeda";

import { submitBatch, SubmitBatchOptions } from "./apps/batch";
import { persistFiles } from "./apps/files";
import { submitTrack } from "./apps/track";
import {
  triggerEventEntryJourneys,
  TriggerEventEntryJourneysOptions,
} from "./journeys";
import {
  EventType,
  IdentifyData,
  PageData,
  ScreenData,
  TrackData,
} from "./types";
import { InsertUserEvent, insertUserEvents } from "./userEvents";

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
    await triggerEventEntryJourneys({
      workspaceId,
      event: data.event,
      userId: userOrAnonymousId,
      messageId: data.messageId,
      properties,
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
      });
      return {
        ...message,
        properties,
      };
    }),
  );
  const data = {
    ...unprocessedData,
    batch,
  };
  await submitBatch({ workspaceId, data });

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
        event: message.event,
        userId: userOrAnonymousId,
        messageId: message.messageId,
        properties: message.properties,
      };
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
