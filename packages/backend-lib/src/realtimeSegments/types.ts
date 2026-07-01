import { JSONValue } from "../types";

export interface RealtimeSegmentEvalJob {
  workspaceId: string;
  messageId: string;
  userId?: string;
  anonymousId?: string;
  userOrAnonymousId: string;
  eventType: string;
  event?: string;
  traitPaths: string[];
  propertyPaths: string[];
  payload: Record<string, JSONValue>;
  eventTime: Date;
  processingTime: Date;
}

export interface ClaimedRealtimeSegmentEvalJob extends RealtimeSegmentEvalJob {
  id: string;
  attempts: number;
}

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
