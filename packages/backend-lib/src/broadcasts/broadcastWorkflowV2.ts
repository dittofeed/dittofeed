/* eslint-disable @typescript-eslint/no-loop-func,no-await-in-loop */
import { ActivityFailure, RetryState } from "@temporalio/common";
import * as wf from "@temporalio/workflow";
import {
  LoggerSinks,
  proxyActivities,
  proxySinks,
  sleep,
} from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "../temporal/activities";
import { BroadcastV2Status, DBWorkspaceOccupantType } from "../types";
import type { SendMessagesResponse } from "./activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export const pauseBroadcastSignal = wf.defineSignal("PauseBroadcast");
export const resumeBroadcastSignal = wf.defineSignal("ResumeBroadcast");
export const cancelBroadcastSignal = wf.defineSignal("CancelBroadcast");

const {
  computeTimezones,
  getBroadcast,
  getZonedTimestamp,
  markBroadcastStatus,
  getBroadcastStatus,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const { config } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minutes",
});

const { sendMessages } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1 second",
    maximumAttempts: 5,
  },
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
  workspaceOccupantId?: string;
  workspaceOccupantType?: DBWorkspaceOccupantType;
}

export async function broadcastWorkflowV2({
  workspaceId,
  broadcastId,
  workspaceOccupantId,
  workspaceOccupantType,
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

  // eslint-disable-next-line prefer-destructuring
  let status: BroadcastV2Status = broadcast.status;

  async function refreshStatus() {
    const updatedStatus = await getBroadcastStatus({
      workspaceId,
      broadcastId,
    });
    if (updatedStatus) {
      status = updatedStatus;
    }
  }

  async function updateStatus(newStatus: BroadcastV2Status) {
    const updatedStatus = await markBroadcastStatus({
      workspaceId,
      broadcastId,
      status: newStatus,
    });
    if (updatedStatus) {
      status = updatedStatus;
    }
  }

  try {
    const { rateLimit } = broadcast.config;

    if (rateLimit !== undefined && rateLimit <= 0) {
      logger.error("rate limit is less than or equal to 0, invalid config", {
        broadcastId,
        rateLimit,
        workspaceId,
      });
      await updateStatus("Cancelled");
      return;
    }

    wf.setHandler(pauseBroadcastSignal, async () => {
      logger.info("pausing broadcast", {
        broadcastId,
        workspaceId,
      });
      await updateStatus("Paused");
    });

    wf.setHandler(resumeBroadcastSignal, async () => {
      logger.info("resuming broadcast", {
        broadcastId,
        workspaceId,
      });
      await updateStatus("Running");
    });

    wf.setHandler(cancelBroadcastSignal, async () => {
      logger.info("cancelling broadcast", {
        broadcastId,
        workspaceId,
      });
      await updateStatus("Cancelled");
    });

    const sendAllMessages = async function sendAllMessages({
      timezones,
      batchSize,
    }: {
      timezones?: string[];
      batchSize: number;
    }) {
      let cursor: string | null = null;
      const { computedPropertiesActivityTaskQueue } = await config([
        "computedPropertiesActivityTaskQueue",
      ]);
      const { recomputeBroadcastSegment } = proxyActivities<typeof activities>({
        startToCloseTimeout: "5 minutes",
        taskQueue: computedPropertiesActivityTaskQueue,
      });
      await recomputeBroadcastSegment({
        workspaceId,
        broadcastId,
        now: Date.now(),
      });
      do {
        await refreshStatus();

        if (status === "Paused") {
          logger.info("waiting for broadcast to be resumed", {
            status,
            workspaceId,
            broadcastId,
          });
          await wf.condition(() => status !== "Paused");
        }

        if (status !== "Running") {
          logger.info("early exit of sendAllMessages no longer running", {
            status,
            workspaceId,
            broadcastId,
          });
          return;
        }
        const activityStartTime = Date.now();

        const {
          nextCursor,
          messagesSent,
          includesNonRetryableError,
        }: SendMessagesResponse = await sendMessages({
          workspaceId,
          broadcastId,
          timezones,
          limit: batchSize,
          cursor: cursor ?? undefined,
          now: activityStartTime,
          workspaceOccupantId,
          workspaceOccupantType,
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

        if (includesNonRetryableError) {
          logger.info("non-retryable error encountered, pausing broadcast", {
            workspaceId,
            broadcastId,
          });
          await updateStatus("Paused");
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

    const { scheduledAt, config: broadcastConfig } = broadcast;
    const { defaultTimezone } = broadcastConfig;
    const batchSize = broadcastConfig.batchSize ?? 100;

    if (scheduledAt) {
      logger.debug("sending scheduled broadcast", {
        workspaceId,
        broadcastId,
        scheduledAt,
      });
      if (!defaultTimezone) {
        logger.error("defaultTimezone is not set", {
          broadcastId,
          workspaceId,
          scheduledAt,
        });
        return;
      }
      if (broadcastConfig.useIndividualTimezone) {
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
        await updateStatus("Scheduled");

        const sendMessagesPromises = Array.from(deliveryTimeMap.entries()).map(
          async ([timestamp, deliveryTimeTimezones]) => {
            const sleepTime = timestamp - Date.now();
            if (sleepTime > 0) {
              // Wait until the localized delivery time
              logger.info("waiting for localized delivery time", {
                timestamp: new Date(timestamp).toISOString(),
                deliveryTimeTimezones: Array.from(deliveryTimeTimezones),
                workspaceId,
                broadcastId,
              });
              await sleep(sleepTime);
            }

            await updateStatus("Running");

            await sendAllMessages({
              timezones: Array.from(deliveryTimeTimezones),
              batchSize,
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
          await updateStatus("Scheduled");

          const sleepTime = timestamp - Date.now();
          if (sleepTime > 0) {
            // Wait until the localized delivery time
            logger.info(
              "waiting for localized delivery time from default timezone",
              {
                timestamp: new Date(timestamp).toISOString(),
                sleepTime,
                workspaceId,
                broadcastId,
              },
            );
            await sleep(sleepTime);
          }

          await updateStatus("Running");

          await sendAllMessages({
            batchSize,
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
      logger.debug("sending immediate broadcast", {
        workspaceId,
        broadcastId,
      });
      await updateStatus("Running");

      await sendAllMessages({
        batchSize,
      });
    }

    await updateStatus("Completed");

    logger.info("broadcast completed", {
      currentTime: new Date().toISOString(),
      workspaceId,
      broadcastId,
    });
  } catch (err) {
    if (
      err instanceof ActivityFailure &&
      err.retryState === RetryState.MAXIMUM_ATTEMPTS_REACHED
    ) {
      logger.info("broadcast failed due to repeated activity failure", {
        workspaceId,
        broadcastId,
        err,
      });
      await updateStatus("Failed");
      return;
    }
    throw err;
  }
}
