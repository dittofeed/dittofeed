import { JSONValue } from "../types";

export type RealtimeSegmentEvalJob = {
  workspaceId: string;
  userOrAnonymousId: string;
  anonymousId?: string;
  userId?: string;
  payload: Record<string, JSONValue>;
  eventTime: Date;
  processingTime: Date;
  messageId: string;
} & (
  | {
      type: "eventReceived";
      eventType: string;
      event?: string;
      traitPaths: string[];
      propertyPaths: string[];
    }
  | { type: "segmentChange"; segment: string }
);

export type ClaimedRealtimeSegmentEvalJob = RealtimeSegmentEvalJob & {
  id: string;
  attempts: number;
};

export interface RealtimeSegmentQueue {
  enqueue(jobs: RealtimeSegmentEvalJob[]): Promise<void>;
  claim(params: {
    batchSize: number;
    lockId: string;
    maxRetries: number;
  }): Promise<ClaimedRealtimeSegmentEvalJob[]>;
  markComplete(params: { id: string; lockId: string }): Promise<void>;
  markFailed(params: {
    id: string;
    lockId: string;
    error: Error;
    maxRetries: number;
  }): Promise<void>;
}
