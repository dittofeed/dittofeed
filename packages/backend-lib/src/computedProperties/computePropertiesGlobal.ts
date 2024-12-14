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

export interface ComputePropertiesGlobalParams {}

export async function computePropertiesGlobal({}: ComputePropertiesGlobalParams) {
  logger.info("computePropertiesGlobal started", {});
}
