/* eslint-disable no-await-in-loop */
import {
  continueAsNew,
  getExternalWorkflowHandle,
  LoggerSinks,
  proxyActivities,
  proxySinks,
  sleep,
} from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "../temporal/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

const {
  sendMessages,
  computeTimezones,
  getBroadcast,
  getZonedTimestamp,
  getFeature,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export function generateBroadcastWorkflowId({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}) {
  return `broadcast-workflow-v2-${workspaceId}-${broadcastId}`;
}

export interface BroadcastWorkflowV2Params {
  workspaceId: string;
  broadcastId: string;
}

export async function broadcastWorkflowV2({
  workspaceId,
  broadcastId,
}: BroadcastWorkflowV2Params): Promise<void> {
  const broadcast = await getBroadcast({ workspaceId, broadcastId });

  if (broadcast.status !== "Draft") {
    logger.info("skipping non-draft broadcast", {
      broadcastId,
      status: broadcast.status,
      workspaceId,
    });
    return;
  }

  const { rateLimit } = broadcast.config;

  if (rateLimit !== undefined && rateLimit <= 0) {
    logger.error("rate limit is 0, invalid config", {
      broadcastId,
      rateLimit,
      workspaceId,
    });
    return;
  }

  const sendRateLimitedMessages = async function sendRateLimitedMessages({
    timezones,
    batchSize,
    usersPerSecond,
  }: {
    timezones: string[];
    batchSize: number;
    usersPerSecond: number;
  }) {
    let cursor: string | null = null;
    do {
      const activityStartTime = Date.now();

      const { nextCursor, messagesSent } = await sendMessages({
        workspaceId,
        timezones,
        limit: batchSize,
        cursor: cursor ?? undefined,
      });

      const activityEndTime = Date.now();
      const activityDurationMillis = activityEndTime - activityStartTime;

      // Refactored logging
      logger.info("sendMessages activity completed.", {
        durationMs: activityDurationMillis,
        messagesSent,
        nextCursor: nextCursor ?? null,
      });

      if (typeof messagesSent !== "number" || messagesSent < 0) {
        // Already follows the pattern
        logger.warn("sendMessages did not return valid messagesSent count.", {
          activityDurationMs: activityDurationMillis,
          returnedValue: messagesSent,
          nextCursor: nextCursor ?? null,
          operation: "Cannot apply rate limit for this batch.",
        });
        cursor = nextCursor ?? null;
        continue;
      }

      let sleepTime = 0;
      if (messagesSent > 0) {
        const targetCycleTimeSeconds = messagesSent / usersPerSecond;
        const targetCycleTimeMillis = targetCycleTimeSeconds * 1000;
        const sleepNeededMillis =
          targetCycleTimeMillis - activityDurationMillis;

        if (sleepNeededMillis > 0) {
          sleepTime = Math.max(10, sleepNeededMillis);
          logger.info("Applying rate limit sleep.", {
            targetCycleMs: targetCycleTimeMillis,
            activityDurationMs: activityDurationMillis,
            sleepNeededMs: sleepNeededMillis,
            sleepDurationMs: sleepTime,
          });
        } else {
          logger.info("Rate limit - no sleep needed.", {
            targetCycleMs: targetCycleTimeMillis,
            activityDurationMs: activityDurationMillis,
            sleepNeededMs: sleepNeededMillis, // Include for context, will be <= 0
          });
          sleepTime = 0;
        }
      } else {
        // Refactored logging (added context)
        logger.info("Rate limit not applicable for this batch.", {
          usersPerSecond,
          messagesSent,
          reason: "No messages sent in batch",
        });
      }

      if (sleepTime > 0) {
        await sleep(sleepTime);
      }

      cursor = nextCursor ?? null;
    } while (cursor != null);
  };

  const { scheduledAt, config } = broadcast;
  if (scheduledAt) {
    if (config.useIndividualTimezone) {
      const { timezones } = await computeTimezones({
        workspaceId,
        defaultTimezone: broadcast.config.defaultTimezone,
      });
      // Map of delivery timestamps to timezones with that delivery timestamp
      const deliveryTimeMap = new Map<number, Set<string>>();
      const timezonePromises = timezones.map(async (timezone) => {
        const { timestamp } = await getZonedTimestamp({
          naiveDateTimeString: scheduledAt,
          timeZone: timezone,
        });
        if (timestamp) {
          const deliveryTimeTimezones = deliveryTimeMap.get(timestamp);
          if (deliveryTimeTimezones) {
            deliveryTimeTimezones.add(timezone);
          } else {
            deliveryTimeMap.set(timestamp, new Set([timezone]));
          }
        }
      });

      await Promise.all(timezonePromises);
      for (const [
        timestamp,
        deliveryTimeTimezones,
      ] of deliveryTimeMap.entries()) {
        await sendMessages({
          workspaceId,
          timezones: Array.from(deliveryTimeTimezones),
          limit: 100,
        });
      }
    } else {
    }
  } else {
  }
  // const timezones = await computeTimezones({
  //   workspaceId,
  // });
}
