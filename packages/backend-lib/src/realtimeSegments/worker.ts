import { randomUUID } from "crypto";
import pLimit from "p-limit";

import config from "../config";
import logger from "../logger";
import { getRealtimeSegmentQueue } from "./queue";
import { ClaimedRealtimeSegmentEvalJob } from "./types";

/* eslint-disable no-await-in-loop */

const DEFAULT_IDLE_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function processRealtimeSegmentJob(job: ClaimedRealtimeSegmentEvalJob): void {
  const mode = config().realtimeSegmentsMode;
  if (mode !== "shadow") {
    throw new Error(
      `Realtime segment evaluator is not implemented for mode ${mode}.`,
    );
  }

  logger().info(
    {
      workspaceId: job.workspaceId,
      messageId: job.messageId,
      userOrAnonymousId: job.userOrAnonymousId,
      eventType: job.eventType,
      event: job.event,
      traitPaths: job.traitPaths,
      propertyPaths: job.propertyPaths,
    },
    "Realtime segment job accepted in shadow mode.",
  );
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
      queueBackend: config().realtimeSegmentsQueueBackend,
      concurrency: config().realtimeSegmentsWorkerConcurrency,
      batchSize: config().realtimeSegmentsQueueBatchSize,
    },
    "Starting realtime segments worker.",
  );

  // eslint-disable-next-line no-constant-condition, @typescript-eslint/no-unnecessary-condition
  while (true) {
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
            processRealtimeSegmentJob(job);
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
