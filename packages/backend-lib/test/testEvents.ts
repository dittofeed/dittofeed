import { randomUUID } from "crypto";
import {
  BatchAppData,
  BatchItem,
  KnownBatchIdentifyData,
  KnownBatchTrackData,
} from "isomorphic-lib/src/types";
import { buildBatchUserEvents } from "../src/apps";
import { insertUserEvents } from "../src/userEvents";
import logger from "../src/logger";
import { omit } from "remeda";

export type TestEventCommon<T> = Omit<T, "messageId" | "timestamp"> & {
  offsetMs: number;
  processingOffsetMs?: number;
};

export type TestEvent =
  | TestEventCommon<KnownBatchIdentifyData>
  | TestEventCommon<KnownBatchTrackData>;

export async function submitBatch({
  workspaceId,
  data,
  now,
}: {
  workspaceId: string;
  data: TestEvent[];
  now: number;
}) {
  logger().debug(
    {
      workspaceId,
    },
    "inserting user events loc-1"
  );
  const batchAppData: BatchAppData = {
    batch: data.map((e) => {
      const timestamp = new Date(e.offsetMs + now).toISOString();
      return {
        ...(omit(e, ["processingOffsetMs", "offsetMs"]) as BatchItem),
        messageId: randomUUID(),
        timestamp,
      };
    }),
  };

  const userEvents = buildBatchUserEvents(batchAppData).map((e, i) => {
    const testEvent = data[i]!;
    const processingTime = new Date(
      (testEvent.processingOffsetMs ?? testEvent.offsetMs) + now
    ).toISOString();

    return {
      ...e,
      processingTime,
    };
  });

  logger().debug(
    {
      workspaceId,
      userEvents,
    },
    "inserting user events loc0"
  );
  await insertUserEvents({
    workspaceId,
    userEvents,
  });
}
