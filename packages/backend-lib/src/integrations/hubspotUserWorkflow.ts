/* eslint-disable @typescript-eslint/no-loop-func,no-await-in-loop, @typescript-eslint/no-unnecessary-condition */
import { LoggerSinks, proxyActivities, proxySinks } from "@temporalio/workflow";
import * as wf from "@temporalio/workflow";
import {
  ComputedPropertyUpdate,
  SegmentUpdate,
  UserPropertyUpdate,
} from "isomorphic-lib/src/types";

// Only import the activity types
import type * as activities from "./hubspotUserWorkflow/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

const {
  findEmailEventsUserProperty,
  getIntegrationEnabled,
  updateHubspotEmails,
  updateHubspotLists,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export const hubspotUserComputedProperties = wf.defineSignal<
  [ComputedPropertyUpdate]
>("hubspotUserComputedProperties");

export function generateHubspotUserWorkflowId({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  return `hubspot-${workspaceId}-${userId}`;
}

interface HubspotUserWorkflowParams {
  workspaceId: string;
  userId: string;
  maxPollingAttempts: number;
}

const TIMEOUT = 5 * 60 * 1000;

export async function hubspotUserWorkflow({
  workspaceId,
  userId,
  maxPollingAttempts = 500,
}: HubspotUserWorkflowParams): Promise<void> {
  const emailEventsUserProperty = await findEmailEventsUserProperty({
    workspaceId,
  });
  if (!emailEventsUserProperty) {
    logger.error("no email events user property found", { workspaceId });
    return;
  }
  let pendinEmailsUpdate: UserPropertyUpdate | null = null;
  const pendingListsUpdates = new Map<string, SegmentUpdate>();

  wf.setHandler(hubspotUserComputedProperties, (signal) => {
    logger.info("hubspot computedProperties", { workspaceId });
    switch (signal.type) {
      case "user_property":
        if (
          signal.userPropertyId !== emailEventsUserProperty.id ||
          (pendinEmailsUpdate !== null &&
            pendinEmailsUpdate.userPropertyVersion >=
              signal.userPropertyVersion)
        ) {
          return;
        }
        pendinEmailsUpdate = signal;
        break;
      case "segment": {
        const existing = pendingListsUpdates.get(signal.segmentId) ?? null;
        if (
          existing !== null &&
          existing.segmentVersion >= signal.segmentVersion
        ) {
          return;
        }
        pendingListsUpdates.set(signal.segmentId, signal);
        break;
      }
    }
  });

  for (let i = 0; i < maxPollingAttempts; i++) {
    const timedOut = !(await wf.condition(
      () => pendingListsUpdates.size > 0 || pendinEmailsUpdate !== null,
      TIMEOUT
    ));
    if (timedOut) {
      break;
    }
    if (!(await getIntegrationEnabled({ workspaceId }))) {
      logger.info("hubspot integration disabled, exiting", { workspaceId });
    }
    const promises: Promise<unknown>[] = [];

    if (pendinEmailsUpdate !== null) {
      promises.push(
        updateHubspotEmails({
          workspaceId,
          userId,
          events: pendinEmailsUpdate,
        })
      );
    }

    if (pendingListsUpdates.size > 0) {
      promises.push(
        updateHubspotLists({
          workspaceId,
          userId,
          segments: Array.from(pendingListsUpdates.values()),
        })
      );
    }

    await Promise.all([updateHubspotEmails, updateHubspotLists]);

    pendinEmailsUpdate = null;
    pendingListsUpdates.clear();
  }
}
