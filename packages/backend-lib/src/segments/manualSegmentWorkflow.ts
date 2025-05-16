import * as wf from "@temporalio/workflow";
import { proxyActivities } from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "../temporal/activities";

const { appendToManualSegment, clearManualSegment, replaceManualSegment } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
  });

export function generateManualSegmentWorkflowId({
  workspaceId,
  segmentId,
}: {
  workspaceId: string;
  segmentId: string;
}) {
  return `manual-segment-workflow-${workspaceId}-${segmentId}`;
}

export interface ManualSegmentWorkflowParams {
  workspaceId: string;
  segmentId: string;
}

export const ManualSegmentOperationTypeEnum = {
  Append: "Append",
  Replace: "Replace",
  Clear: "Clear",
} as const;

export type ManualSegmentOperationType =
  keyof typeof ManualSegmentOperationTypeEnum;

export interface ClearOperation {
  type: typeof ManualSegmentOperationTypeEnum.Clear;
}

export interface AppendOperation {
  type: typeof ManualSegmentOperationTypeEnum.Append;
  userIds: string[];
}

export interface ReplaceOperation {
  type: typeof ManualSegmentOperationTypeEnum.Replace;
  userIds: string[];
}

export type ManualSegmentOperation = AppendOperation | ReplaceOperation;

export const enqueueManualSegmentOperation = wf.defineSignal<
  [ManualSegmentOperation]
>("EnqueueManualSegmentOperation");

export async function manualSegmentWorkflow({
  workspaceId,
  segmentId,
}: ManualSegmentWorkflowParams): Promise<{ lastComputedAt: string }> {
  // handle signal with replace or append operation by pushing into queue
  // iterate through queue collapsing appends into a single update, chunked by 100
  // after either append or replace, update the lastComputedAt value
  // when performing a replace operation, update the segment version (at the end or beginning of the operation)
  let now: number;
  const queue: ManualSegmentOperation[] = [];
  while (true) {
    now = Date.now();
  }
  return { lastComputedAt: new Date(now).toISOString() };
}
