/* eslint-disable @typescript-eslint/no-loop-func,no-await-in-loop, @typescript-eslint/no-unnecessary-condition */
import { LoggerSinks, proxyActivities, proxySinks } from "@temporalio/workflow";
import * as wf from "@temporalio/workflow";
import {
  ComputedPropertyUpdate,
  ParsedPerformedManyValueItem,
  SegmentUpdate,
  UserPropertyUpdate,
} from "isomorphic-lib/src/types";
import { Overwrite } from "utility-types";

import { parseUserProperty } from "../userProperties";
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

// 5 minutes
const TIMEOUT = 5 * 60 * 1000;

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
          return;
        }
        pendingListsUpdates.set(signal.segmentId, signal);
        break;
      }
    }
  });

  await wf.condition(
    () => pendingListsUpdates.size > BATCH_SIZE || pendingEmailsUpdate !== null,
    TIMEOUT
  );
  if (!(await getIntegrationEnabled({ workspaceId }))) {
    logger.info("hubspot integration disabled, exiting", { workspaceId });
  }
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

  await Promise.all([updateHubspotEmails, updateHubspotLists]);
}
