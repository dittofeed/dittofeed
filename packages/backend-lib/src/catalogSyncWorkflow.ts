/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import {
  continueAsNew,
  LoggerSinks,
  proxyActivities,
  proxySinks,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "./catalogSyncActivities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export const CATALOG_SYNC_SCHEDULER_WORKFLOW_ID = "catalog-sync-scheduler";

const { catalogFindDue, catalogSyncOne, catalogSyncConfig } = proxyActivities<
  typeof activities
>({
  // A tick may pull several feeds, each with a 60s HTTP timeout.
  startToCloseTimeout: "1 hour",
});

/**
 * Periodic feed sync for catalogs.
 *
 * One global workflow rather than one per catalog: catalogs are few, the work is
 * I/O bound, and a single loop is far easier to reason about than thousands of
 * independent schedules. Concurrency safety comes from `claimCatalog`, which
 * pushes `nextSyncAt` forward atomically, so two workers polling at the same
 * time cannot both pull the same feed.
 */
export async function catalogSyncSchedulerWorkflow() {
  const {
    catalogSyncSchedulerInterval,
    catalogSyncSchedulerIterations,
    catalogSyncBatchSize,
  } = await catalogSyncConfig();

  let iterationCount = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const due = await catalogFindDue({
      now: Date.now(),
      limit: catalogSyncBatchSize,
    });
    logger.info("Catalog sync: polled for due catalogs", {
      dueCount: due.length,
      batchSize: catalogSyncBatchSize,
    });

    for (const catalog of due) {
      const result = await catalogSyncOne({
        catalogId: catalog.id,
        now: Date.now(),
      });
      if (result && result.status === "failed") {
        logger.error("Catalog sync: feed failed", {
          catalogId: result.catalogId,
          catalogName: result.catalogName,
          error: result.error,
        });
      }
    }

    iterationCount += 1;
    if (iterationCount >= catalogSyncSchedulerIterations) {
      logger.info("Catalog sync: continuing as new", { iterationCount });
      await continueAsNew<typeof catalogSyncSchedulerWorkflow>();
    }

    await sleep(catalogSyncSchedulerInterval);
  }
}
