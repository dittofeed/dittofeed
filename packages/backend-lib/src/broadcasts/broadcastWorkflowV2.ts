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
