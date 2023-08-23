/* eslint-disable @typescript-eslint/no-loop-func,no-await-in-loop, @typescript-eslint/no-unnecessary-condition */
import { LoggerSinks, proxyActivities, proxySinks } from "@temporalio/workflow";
import * as wf from "@temporalio/workflow";
import {
  ComputedPropertyUpdate,
  ParsedPerformedManyValueItem,
  SegmentUpdate,
  UserPropertyUpdate,
} from "isomorphic-lib/src/types";
import { parseUserProperty } from "isomorphic-lib/src/userProperties";
import { Overwrite } from "utility-types";

// Only import the activity types
import type * as activities from "./hubspot/activities";

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

const BATCH_SIZE = 10;

interface HubspotUserWorkflowParams {
  workspaceId: string;
  userId: string;
}

// FIXE
// const TIMEOUT = 30 * 1000;
const TIMEOUT = 5 * 1000;

export async function hubspotUserWorkflow({
  workspaceId,
  userId,
}: HubspotUserWorkflowParams): Promise<void> {
  const emailEventsUserProperty = await findEmailEventsUserProperty({
    workspaceId,
  });
  if (!emailEventsUserProperty) {
    logger.error("no email events user property found", { workspaceId });
    return;
  }
  let pendingEmailsUpdate: Overwrite<
    UserPropertyUpdate,
    {
      value: ParsedPerformedManyValueItem[];
    }
  > | null = null;
  const pendingListsUpdates = new Map<string, SegmentUpdate>();

  wf.setHandler(hubspotUserComputedProperties, (signal) => {
    logger.info("hubspot computedProperties", { workspaceId });
    switch (signal.type) {
      case "user_property": {
        if (
          signal.userPropertyId !== emailEventsUserProperty.id ||
          (pendingEmailsUpdate !== null &&
            pendingEmailsUpdate.userPropertyVersion >=
              signal.userPropertyVersion)
        ) {
          logger.error("invalid user property update", { workspaceId, signal });
          return;
        }
        const parsed = parseUserProperty(
          emailEventsUserProperty.definition,
          signal.value
        );
        if (parsed.isErr()) {
          logger.error("failed to parse user property", {
            workspaceId,
            err: parsed.error,
          });
          return;
        }
        const value = parsed.value as ParsedPerformedManyValueItem[];

        pendingEmailsUpdate = {
          ...signal,
          value,
        };
        break;
      }
      case "segment": {
        const existing = pendingListsUpdates.get(signal.segmentId) ?? null;
        if (
          existing !== null &&
          existing.segmentVersion >= signal.segmentVersion
        ) {
          logger.error("invalid segment update", { workspaceId, signal });
          return;
        }
        pendingListsUpdates.set(signal.segmentId, signal);
        break;
      }
    }
  });

  logger.info("waiting for hubspot user batch", { workspaceId, userId });
  const batchFull = await wf.condition(
    () => pendingListsUpdates.size > BATCH_SIZE || pendingEmailsUpdate !== null,
    TIMEOUT
  );
  if (batchFull) {
    logger.info("hubspot user batch ready", {
      workspaceId,
      userId,
      segmentsSize: pendingListsUpdates.size,
      emailsUpdate: pendingEmailsUpdate,
    });
  } else {
    logger.info("hubspot user batch timed out", {
      workspaceId,
      userId,
      segmentsSize: pendingListsUpdates.size,
      emailsUpdate: pendingEmailsUpdate,
    });
  }
  if (!(await getIntegrationEnabled({ workspaceId }))) {
    logger.info("hubspot integration disabled, exiting", { workspaceId });
    return;
  }
  logger.info("syncing to hubspot", { workspaceId, userId });
  const promises: Promise<unknown>[] = [];

  if (pendingEmailsUpdate !== null) {
    promises.push(
      updateHubspotEmails({
        workspaceId,
        userId,
        events: pendingEmailsUpdate,
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

  await Promise.all(promises);
}
