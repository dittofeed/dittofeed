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

export const COMPUTE_PROPERTIES_WORKFLOW_GLOBAL_ID =
  "compute-properties-global";

export interface ComputePropertiesWorkflowGlobalParams {}

export async function computePropertiesWorkflowGlobal({}: ComputePropertiesWorkflowGlobalParams) {
  logger.info("computePropertiesGlobal started", {});
}
