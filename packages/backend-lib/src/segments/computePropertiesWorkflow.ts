/* eslint-disable no-await-in-loop */
import {
  continueAsNew,
  LoggerSinks,
  proxyActivities,
  proxySinks,
  sleep,
} from "@temporalio/workflow";
import * as wf from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "../temporal/activities";
import { EnrichedJourney } from "../types";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

const {
  computePropertiesIncremental,
  computePropertiesIncrementalArgs,
  config,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export const userJourneyInitialize = wf.defineSignal<[string]>(
  "userJourneyInitialize",
);

export function generateComputePropertiesId(workspaceId: string) {
  return `compute-properties-workflow-${workspaceId}`;
}

export const POLLING_JITTER_COEFFICIENT = 1000;

export interface ComputedPropertiesWorkflowParams {
  workspaceId: string;
  // TODO deprecated, remove
  tableVersion: string;
  maxPollingAttempts?: number;
  shouldContinueAsNew?: boolean;
  basePollingPeriod?: number;
  pollingJitterCoefficient?: number;
  subscribedJourneys?: EnrichedJourney[];
}

export async function computePropertiesWorkflow({
  tableVersion,
  workspaceId,
  shouldContinueAsNew = false,
  maxPollingAttempts = 1500,
  // useful primarily for testing
  basePollingPeriod: basePollingPeriodOverride,
  pollingJitterCoefficient = POLLING_JITTER_COEFFICIENT,
  subscribedJourneys = [],
}: ComputedPropertiesWorkflowParams): Promise<ComputedPropertiesWorkflowParams> {
  for (let i = 0; i < maxPollingAttempts; i++) {
    const currentTime = Date.now();

    logger.info("segmentsNotificationWorkflow polling attempt", {
      i,
      currentTime,
      maxPollingAttempts,
    });

    const { computePropertiesInterval } = await config([
      "computePropertiesInterval",
    ]);

    try {
      const args = await computePropertiesIncrementalArgs({
        workspaceId,
      });
      await computePropertiesIncremental({
        ...args,
        now: currentTime,
      });
    } catch (e) {
      logger.error("computePropertiesWorkflow failed to re-compute", {
        err: e,
      });
    }

    // only use override if shouldContinueAsNew is false, in order to allow value
    // to be reconfigured at deploy time
    const basePollingInterval =
      shouldContinueAsNew || !basePollingPeriodOverride
        ? computePropertiesInterval
        : basePollingPeriodOverride;

    const period =
      basePollingInterval + Math.random() * pollingJitterCoefficient;

    logger.debug("segmentsNotificationWorkflow sleeping started", {
      period,
    });
    // sleep for 10 seconds + up to 1 seconds of jitter for next polling period
    await sleep(period);
  }

  const params: ComputedPropertiesWorkflowParams = {
    basePollingPeriod: basePollingPeriodOverride,
    maxPollingAttempts,
    pollingJitterCoefficient,
    shouldContinueAsNew,
    subscribedJourneys,
    tableVersion,
    workspaceId,
  };

  if (shouldContinueAsNew) {
    await continueAsNew<typeof computePropertiesWorkflow>(params);
  }
  return params;
}
