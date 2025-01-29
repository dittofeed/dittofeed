/* eslint-disable no-await-in-loop */
import {
  continueAsNew,
  LoggerSinks,
  proxyActivities,
  proxySinks,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "../temporal/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

const {} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export function computePropertiesWorkflowScheduledId({
  workflowId,
}: {
  workflowId: string;
}) {
  return `compute-properties-scheduled-${workflowId}`;
}

export const COMPUTE_PROPERTIES_SCHEDULE_ID = "compute-properties-schedule";

export interface ComputePropertiesWorkflowScheduledParams {}

export async function computePropertiesWorkflowScheduled({}: ComputePropertiesWorkflowScheduledParams) {
  logger.info("computePropertiesScheduled started", {});
}
