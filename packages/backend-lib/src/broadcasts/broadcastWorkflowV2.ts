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
      const startTime = Date.now();
      const { nextCursor } = await sendMessages({
        workspaceId,
        timezones,
        limit: batchSize,
        cursor: cursor ?? undefined,
      });
      const endTime = Date.now();

      // FIXME
      const sleepTime = 0;
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
