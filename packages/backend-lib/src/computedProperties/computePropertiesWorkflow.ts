/* eslint-disable no-await-in-loop */
import {
  continueAsNew,
  LoggerSinks,
  proxyActivities,
  proxySinks,
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

export const computePropertiesEarlySignal = wf.defineSignal(
  "computePropertiesEarlySignal",
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
  // useful primarily for testing
  basePollingPeriod: basePollingPeriodOverride,
  // useful primarily for testing
  maxPollingAttempts: maxPollingAttemptsOverride = 1500,
  pollingJitterCoefficient = POLLING_JITTER_COEFFICIENT,
  subscribedJourneys = [],
}: ComputedPropertiesWorkflowParams): Promise<ComputedPropertiesWorkflowParams> {
  let i = 0;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    const currentTime = Date.now();

    logger.info("segmentsNotificationWorkflow polling attempt", {
      i,
      currentTime,
      workspaceId,
    });

    const { computePropertiesInterval, computePropertiesAttempts } =
      await config(["computePropertiesInterval", "computePropertiesAttempts"]);

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
        workspaceId,
      });
    }

    // only use override if shouldContinueAsNew is false, in order to allow value
    // to be reconfigured at deploy time
    const basePollingInterval =
      shouldContinueAsNew || !basePollingPeriodOverride
        ? computePropertiesInterval
        : basePollingPeriodOverride;

    const maxPollingAttempts =
      shouldContinueAsNew || !maxPollingAttemptsOverride
        ? computePropertiesAttempts
        : maxPollingAttemptsOverride;

    const period =
      basePollingInterval + Math.random() * pollingJitterCoefficient;

    let wokeUpEarly = false;
    wf.setHandler(computePropertiesEarlySignal, () => {
      logger.info("computePropertiesWorkflow woke up early", { workspaceId });
      wokeUpEarly = true;
    });

    logger.debug("segmentsNotificationWorkflow sleeping started", {
      period,
      i,
      maxPollingAttempts,
      workspaceId,
    });

    // sleep for 10 seconds + up to 1 seconds of jitter for next polling period
    // or until computePropertiesEarlySignal is received
    await wf.condition(() => wokeUpEarly, period);

    if (wokeUpEarly) {
      logger.info("computePropertiesWorkflow woke up early, computing now.", {
        workspaceId,
      });
      // Reset the flag for the next iteration
      wokeUpEarly = false;
    }

    i += 1;
    if (i >= maxPollingAttempts) {
      logger.debug("segmentsNotificationWorkflow polling ended", {
        i,
        maxPollingAttempts,
        workspaceId,
      });
      break;
    }
  }

  const params: ComputedPropertiesWorkflowParams = {
    basePollingPeriod: basePollingPeriodOverride,
    maxPollingAttempts: maxPollingAttemptsOverride,
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
