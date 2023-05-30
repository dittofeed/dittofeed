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
  const userEvent: InsertUserEvent = {
    messageRaw: JSON.stringify({
      type: "identify",
      ...data,
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
  const userEvent: InsertUserEvent = {
    messageRaw: JSON.stringify({
      type: "track",
      ...data,
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
  const userEvent: InsertUserEvent = {
    messageRaw: JSON.stringify({
      type: "page",
      ...data,
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
  const userEvent: InsertUserEvent = {
    messageRaw: JSON.stringify({
      type: "screen",
      ...data,
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

  const userEvents: InsertUserEvent[] = batch.map((message) => ({
    messageId: message.messageId,
    messageRaw: JSON.stringify({
      ...message,
      context,
    }),
  }));

  await insertUserEvents({
    workspaceId,
    userEvents,
  });
}
