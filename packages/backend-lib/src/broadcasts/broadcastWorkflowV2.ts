/* eslint-disable no-await-in-loop */
import {
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
  markBroadcastStatus,
  getBroadcastStatus,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export function generateBroadcastWorkflowV2Id({
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
  if (!broadcast) {
    logger.error("broadcast not found", {
      broadcastId,
      workspaceId,
    });
    return;
  }

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
    await markBroadcastStatus({
      workspaceId,
      broadcastId,
      status: "Cancelled",
    });
    return;
  }

  const sendAllMessages = async function sendAllMessages({
    timezones,
    batchSize,
  }: {
    timezones?: string[];
    batchSize: number;
  }) {
    let cursor: string | null = null;
    do {
      const { status } = await getBroadcastStatus({
        workspaceId,
        broadcastId,
      });
      if (status !== "Running") {
        logger.info("early exit of sendAllMessages no longer running", {
          status,
          workspaceId,
          broadcastId,
        });
        return;
      }
      const activityStartTime = Date.now();

      const { nextCursor, messagesSent } = await sendMessages({
        workspaceId,
        broadcastId,
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
      if (rateLimit && messagesSent > 0) {
        const targetCycleTimeSeconds = messagesSent / rateLimit;
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
            sleepNeededMs: sleepNeededMillis,
          });
          sleepTime = 0;
        }
      } else {
        logger.info("Rate limit not applicable for this batch.", {
          rateLimit,
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
  const { defaultTimezone } = config;

  if (scheduledAt) {
    if (!defaultTimezone) {
      logger.error("defaultTimezone is not set", {
        broadcastId,
        workspaceId,
        scheduledAt,
      });
      return;
    }
    if (config.useIndividualTimezone) {
      const { timezones } = await computeTimezones({
        workspaceId,
        defaultTimezone,
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
        } else {
          logger.info("user specific timezone is invalid", {
            timezone,
            scheduledAt,
          });
        }
      });

      await Promise.all(timezonePromises);

      await markBroadcastStatus({
        workspaceId,
        broadcastId,
        status: "Scheduled",
      });

      const sendMessagesPromises = Array.from(deliveryTimeMap.entries()).map(
        async ([timestamp, deliveryTimeTimezones]) => {
          const sleepTime = timestamp - Date.now();
          if (sleepTime > 0) {
            // Wait until the localized delivery time
            await sleep(sleepTime);
          }

          await markBroadcastStatus({
            workspaceId,
            broadcastId,
            status: "Running",
          });

          await sendAllMessages({
            timezones: Array.from(deliveryTimeTimezones),
            batchSize: 100,
          });
        },
      );

      await Promise.all(sendMessagesPromises);
    } else {
      const { timestamp } = await getZonedTimestamp({
        naiveDateTimeString: scheduledAt,
        timeZone: defaultTimezone,
      });
      if (timestamp) {
        await markBroadcastStatus({
          workspaceId,
          broadcastId,
          status: "Scheduled",
        });

        const sleepTime = timestamp - Date.now();
        if (sleepTime > 0) {
          // Wait until the localized delivery time
          await sleep(sleepTime);
        }

        await markBroadcastStatus({
          workspaceId,
          broadcastId,
          status: "Running",
        });

        await sendAllMessages({
          batchSize: 100,
        });
      } else {
        logger.error(
          "workspace member specified timezone is invalid for scheduled broadcast, should have validated",
          {
            broadcastId,
            workspaceId,
            scheduledAt,
          },
        );
      }
    }
  } else {
    await markBroadcastStatus({
      workspaceId,
      broadcastId,
      status: "Running",
    });

    await sendAllMessages({
      batchSize: 100,
    });
  }

  await markBroadcastStatus({
    workspaceId,
    broadcastId,
    status: "Completed",
  });
}
