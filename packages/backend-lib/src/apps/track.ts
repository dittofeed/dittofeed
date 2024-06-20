// pulled into separate file to avoid circular dependencies
import * as R from "remeda";

import { TrackData } from "../types";
import { InsertUserEvent, insertUserEvents } from "../userEvents";
import { persistFiles } from "./files";

export async function submitTrack({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: TrackData;
}) {
  const rest = R.omit(data, ["timestamp", "properties"]);
  let properties = data.properties ?? {};
  if (data.files) {
    properties = await persistFiles({
      files: data.files,
      messageId: data.messageId,
      properties,
    });
  }
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
}
