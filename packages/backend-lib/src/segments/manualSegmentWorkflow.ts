/* eslint-disable no-await-in-loop */
import * as wf from "@temporalio/workflow";
import { LoggerSinks, proxyActivities, proxySinks } from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "../temporal/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

const { appendToManualSegment, clearManualSegment, replaceManualSegment } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: {
      maximumAttempts: 5,
    },
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

export type ManualSegmentOperation =
  | AppendOperation
  | ReplaceOperation
  | ClearOperation;

export const enqueueManualSegmentOperation = wf.defineSignal<
  [ManualSegmentOperation]
>("EnqueueManualSegmentOperation");

const USER_ID_CHUNK_SIZE = 100;

export async function manualSegmentWorkflow({
  workspaceId,
  segmentId,
}: ManualSegmentWorkflowParams): Promise<{
  lastProcessedAt: string;
}> {
  let lastProcessedAt = 0;
  const queue: ManualSegmentOperation[] = [];

  wf.setHandler(enqueueManualSegmentOperation, (operation) => {
    logger.info("Received signal to enqueue manual segment operation", {
      operationType: operation.type,
      workspaceId,
      segmentId,
    });
    queue.push(operation);
  });

  await wf.condition(() => queue.length > 0);

  // Main processing loop
  mainLoop: while (true) {
    if (queue.length === 0) {
      break;
    }
    const currentOperation = queue.shift();
    if (!currentOperation) {
      break;
    }

    logger.info("Processing manual segment operation from queue.", {
      operationType: currentOperation.type,
      workspaceId,
      segmentId,
    });

    const currentTime = Date.now();

    switch (currentOperation.type) {
      case ManualSegmentOperationTypeEnum.Replace: {
        const success = await replaceManualSegment({
          workspaceId,
          segmentId,
          userIds: currentOperation.userIds,
          now: currentTime,
        });
        if (!success) {
          logger.error("Replace operation failed.", {
            workspaceId,
            segmentId,
            currentOperation,
          });
          break mainLoop;
        }
        lastProcessedAt = currentTime;
        logger.info("Replace operation completed.", {
          workspaceId,
          segmentId,
          userCount: currentOperation.userIds.length,
        });
        break;
      }

      case ManualSegmentOperationTypeEnum.Append: {
        const userIdsToProcess: string[] = [...currentOperation.userIds];

        while (queue.length > 0) {
          const nextAppendOp = queue[0];
          if (
            !nextAppendOp ||
            nextAppendOp.type !== ManualSegmentOperationTypeEnum.Append
          ) {
            break;
          }
          queue.shift();
          userIdsToProcess.push(...nextAppendOp.userIds);
          logger.info("Collapsed subsequent Append operation.", {
            workspaceId,
            segmentId,
          });
        }

        const uniqueUserIds = Array.from(new Set(userIdsToProcess));

        if (uniqueUserIds.length > 0) {
          logger.info("Appending unique user IDs.", {
            count: uniqueUserIds.length,
            workspaceId,
            segmentId,
          });
          for (let i = 0; i < uniqueUserIds.length; i += USER_ID_CHUNK_SIZE) {
            const chunk = uniqueUserIds.slice(i, i + USER_ID_CHUNK_SIZE);
            const success = await appendToManualSegment({
              workspaceId,
              segmentId,
              userIds: chunk,
              now: currentTime,
            });
            logger.info("Append operation completed for chunk.", {
              workspaceId,
              segmentId,
              userCount: chunk.length,
            });
            if (!success) {
              logger.error("Append operation failed.", {
                workspaceId,
                segmentId,
                currentOperation,
              });
              break mainLoop;
            }
          }
        } else {
          logger.info(
            "No unique user IDs to append after collapsing and deduplication.",
            { workspaceId, segmentId },
          );
        }
        lastProcessedAt = currentTime;
        logger.info("Append operation completed.", {
          workspaceId,
          segmentId,
        });
        break;
      }

      case ManualSegmentOperationTypeEnum.Clear: {
        const success = await clearManualSegment({
          workspaceId,
          segmentId,
          now: currentTime,
        });
        if (!success) {
          logger.error("Clear operation failed.", {
            workspaceId,
            segmentId,
            currentOperation,
          });
          break mainLoop;
        }
        lastProcessedAt = currentTime;
        logger.info("Clear operation completed.", {
          workspaceId,
          segmentId,
        });
        break;
      }

      default:
        logger.error("Unknown operation type encountered", {
          workspaceId,
          segmentId,
          currentOperation,
        });
        break mainLoop;
    }
  }
  return { lastProcessedAt: new Date(lastProcessedAt).toISOString() };
}
