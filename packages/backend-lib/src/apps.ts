import * as R from "remeda";

import {
  BatchAppData,
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
  const rest = R.omit(data, ["timestamp"]);
  const timestamp = data.timestamp ?? new Date().toISOString();

  const userEvent: InsertUserEvent = {
    messageRaw: JSON.stringify({
      type: "identify",
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
  const rest = R.omit(data, ["timestamp"]);
  const timestamp = data.timestamp ?? new Date().toISOString();

  const userEvent: InsertUserEvent = {
    messageRaw: JSON.stringify({
      type: "track",
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

export async function submitPage({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: PageData;
}) {
  const rest = R.omit(data, ["timestamp"]);
  const timestamp = data.timestamp ?? new Date().toISOString();

  const userEvent: InsertUserEvent = {
    messageRaw: JSON.stringify({
      type: "page",
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
  const rest = R.omit(data, ["timestamp"]);
  const timestamp = data.timestamp ?? new Date().toISOString();

  const userEvent: InsertUserEvent = {
    messageRaw: JSON.stringify({
      type: "screen",
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

export async function submitBatch({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: BatchAppData;
}) {
  const { context, batch } = data;

  const userEvents: InsertUserEvent[] = batch.map((message) => {
    const rest = R.omit(message, ["timestamp"]);
    const timestamp = message.timestamp ?? new Date().toISOString();
    return {
      messageId: message.messageId,
      messageRaw: JSON.stringify({
        timestamp,
        context,
        ...rest,
      }),
    };
  });

  await insertUserEvents({
    workspaceId,
    userEvents,
  });
}
