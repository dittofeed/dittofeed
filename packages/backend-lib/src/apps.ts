import * as R from "remeda";

import {
  getEventTriggeredJourneys,
  triggerEventEntryJourneys,
} from "./journeys";
import logger from "./logger";
import {
  BatchAppData,
  EventType,
  IdentifyData,
  JourneyNodeType,
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

export async function submitTrack({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: TrackData;
}) {
  const rest = R.omit(data, ["timestamp", "properties"]);
  const properties = data.properties ?? {};
  const timestamp = data.timestamp ?? new Date().toISOString();

  const userEvent: InsertUserEvent = {
    messageRaw: JSON.stringify({
      type: "track",
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

  let userOrAnonymousId: string | null = null;
  if ("userId" in data) {
    userOrAnonymousId = data.userId;
  } else if ("anonymousId" in data) {
    userOrAnonymousId = data.anonymousId;
  }

  if (userOrAnonymousId) {
    await triggerEventEntryJourneys({
      workspaceId,
      event: rest.event,
      userId: userOrAnonymousId,
    });
  }
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

export interface SubmitBatchOptions {
  workspaceId: string;
  data: BatchAppData;
}

export function buildBatchUserEvents(data: BatchAppData): InsertUserEvent[] {
  const { context, batch } = data;

  return batch.map((message) => {
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
      messageRaw.properties = message.properties ?? {};
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
}

export async function submitBatch({ workspaceId, data }: SubmitBatchOptions) {
  const userEvents = buildBatchUserEvents(data);

  await insertUserEvents({
    workspaceId,
    userEvents,
  });
}
