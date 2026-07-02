import config from "../config";
import { NatsRealtimeSegmentQueue } from "./queue/nats";
import { PostgresRealtimeSegmentQueue } from "./queue/postgres";
import { RealtimeSegmentQueue } from "./types";

let QUEUE: RealtimeSegmentQueue | null = null;

export function getRealtimeSegmentQueue(): RealtimeSegmentQueue {
  if (QUEUE) {
    return QUEUE;
  }
  switch (config().realtimeSegmentsQueueBackend) {
    case "postgres":
      QUEUE = new PostgresRealtimeSegmentQueue();
      return QUEUE;
    case "nats":
      QUEUE = new NatsRealtimeSegmentQueue();
      return QUEUE;
    case "bullmq":
      throw new Error("BullMQ realtime segment queue is not implemented yet.");
  }
}
