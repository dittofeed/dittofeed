import { randomUUID } from "crypto";
import {
  AnonymousBatchIdentifyData,
  AnonymousBatchTrackData,
  BatchAppData,
  BatchItem,
  KnownBatchIdentifyData,
  KnownBatchTrackData,
} from "isomorphic-lib/src/types";
import { omit } from "remeda";

import { buildBatchUserEvents } from "../src/apps/batch";
import { insertUserEvents } from "../src/userEvents";

export type TestEventCommon<T> = Omit<T, "messageId" | "timestamp"> & {
  offsetMs: number;
  messageId?: string;
  processingOffsetMs?: number;
};

export type TestEvent =
  | TestEventCommon<KnownBatchIdentifyData>
  | TestEventCommon<KnownBatchTrackData>
  | TestEventCommon<AnonymousBatchIdentifyData>
  | TestEventCommon<AnonymousBatchTrackData>;

export async function submitBatch({
  workspaceId,
  data,
  now,
}: {
  workspaceId: string;
  data: TestEvent[];
  now: number;
}) {
  const batchAppData: BatchAppData = {
    batch: data.map((e) => {
      const timestamp = new Date(e.offsetMs + now).toISOString();
      return {
        ...(omit(e, ["processingOffsetMs", "offsetMs"]) as BatchItem),
        messageId: e.messageId ?? randomUUID(),
        timestamp,
      };
    }),
  };

  const userEvents = buildBatchUserEvents(batchAppData).map((e, i) => {
    const testEvent = data[i]!;
    const processingTime = new Date(
      (testEvent.processingOffsetMs ?? testEvent.offsetMs) + now,
    ).toISOString();

    return {
      ...e,
      processingTime,
    };
  });

  await insertUserEvents({
    workspaceId,
    userEvents,
  });
}
