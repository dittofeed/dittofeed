import { randomUUID } from "crypto";
import pLimit from "p-limit";

import config from "../config";
import logger from "../logger";
import { enqueueDueDelayedReevaluations } from "./delayed";
import { processRealtimeSegmentJob } from "./process";
import { getRealtimeSegmentQueue } from "./queue";
import { ClaimedRealtimeSegmentEvalJob } from "./types";

/* eslint-disable no-await-in-loop */

const DEFAULT_IDLE_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function processRealtimeSegmentEvalJob(
  job: ClaimedRealtimeSegmentEvalJob,
): Promise<void> {
  const mode = config().realtimeSegmentsMode;
  const writeAssignments =
    mode === "write" || mode === "trigger" || mode === "read";
  const triggerJourneys =
    (mode === "trigger" || mode === "read") &&
    config().realtimeSegmentsTriggerJourneys;

  const result = await processRealtimeSegmentJob({
    job,
    mode,
    writeAssignments,
    triggerJourneys,
  });

  logger().info(
    {
      workspaceId: job.workspaceId,
      messageId: job.messageId,
      userOrAnonymousId: job.userOrAnonymousId,
      eventType: job.eventType,
      event: job.event,
      traitPaths: job.traitPaths,
      propertyPaths: job.propertyPaths,
      mode,
      writeAssignments,
      triggerJourneys,
      realtimeSegmentsTriggerJourneys: config().realtimeSegmentsTriggerJourneys,
      candidateCount: result.candidateCount,
      evaluatedCount: result.evaluatedCount,
      unsupportedCount: result.unsupportedCount,
      writtenCount: result.writtenCount,
      triggeredJourneyCount: result.triggeredJourneyCount,
      changes: result.changes,
    },
    "Realtime segment job processed.",
  );
}

async function enqueueDueDelayedRealtimeSegmentJobs(): Promise<void> {
  if (!config().realtimeSegmentsDelayedReevaluationEnabled) {
    return;
  }
  try {
    const enqueuedCount = await enqueueDueDelayedReevaluations({
      batchSize: config().realtimeSegmentsDelayedReevaluationBatchSize,
      maxRetries: config().realtimeSegmentsMaxRetries,
    });
    if (enqueuedCount > 0) {
      logger().info(
        { enqueuedCount },
        "Enqueued delayed realtime segment reevaluation jobs.",
      );
    }
  } catch (err) {
    logger().error(
      { err },
      "Failed to enqueue due delayed realtime segment reevaluation jobs.",
    );
  }
}

export async function runRealtimeSegmentsWorker(): Promise<void> {
  if (!config().realtimeSegmentsEnabled) {
    logger().info("Realtime segments worker disabled.");
    return;
  }

  const lockId = randomUUID();
  const queue = getRealtimeSegmentQueue();
  const limit = pLimit(config().realtimeSegmentsWorkerConcurrency);

  logger().info(
    {
      lockId,
      mode: config().realtimeSegmentsMode,
      triggerJourneys: config().realtimeSegmentsTriggerJourneys,
      queueBackend: config().realtimeSegmentsQueueBackend,
      concurrency: config().realtimeSegmentsWorkerConcurrency,
      batchSize: config().realtimeSegmentsQueueBatchSize,
      delayedReevaluationEnabled:
        config().realtimeSegmentsDelayedReevaluationEnabled,
      delayedReevaluationBatchSize:
        config().realtimeSegmentsDelayedReevaluationBatchSize,
    },
    "Starting realtime segments worker.",
  );

  // eslint-disable-next-line no-constant-condition, @typescript-eslint/no-unnecessary-condition
  while (true) {
    await enqueueDueDelayedRealtimeSegmentJobs();
    const jobs = await queue.claim({
      batchSize: config().realtimeSegmentsQueueBatchSize,
      lockId,
      maxRetries: config().realtimeSegmentsMaxRetries,
    });

    if (jobs.length === 0) {
      await sleep(DEFAULT_IDLE_DELAY_MS);
      continue;
    }

    await Promise.all(
      jobs.map((job) =>
        limit(async () => {
          try {
            await processRealtimeSegmentEvalJob(job);
            await queue.markComplete({ id: job.id, lockId });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            logger().error(
              {
                err: error,
                workspaceId: job.workspaceId,
                messageId: job.messageId,
                jobId: job.id,
              },
              "Realtime segment job failed.",
            );
            await queue.markFailed({
              id: job.id,
              lockId,
              error,
              maxRetries: config().realtimeSegmentsMaxRetries,
            });
          }
        }),
      ),
    );
  }
}
