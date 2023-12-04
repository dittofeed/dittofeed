/* eslint-disable no-await-in-loop */
import {
  continueAsNew,
  LoggerSinks,
  proxyActivities,
  proxySinks,
  sleep,
} from "@temporalio/workflow";
import * as wf from "@temporalio/workflow";

import { FEATURE_INCREMENTAL_COMP } from "../constants";
// Only import the activity types
import type * as activities from "../temporal/activities";
import { EnrichedJourney } from "../types";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

const {
  computePropertiesPeriod,
  findAllJourneysUnsafe,
  findAllUserProperties,
  computePropertiesIncremental,
  computePropertiesIncrementalArgs,
  getFeature,
  config,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export const userJourneyInitialize = wf.defineSignal<[string]>(
  "userJourneyInitialize"
);

export function generateComputePropertiesId(workspaceId: string) {
  return `compute-properties-workflow-${workspaceId}`;
}

export const POLLING_JITTER_COEFFICIENT = 1000;

export interface ComputedPropertiesWorkflowParams {
  workspaceId: string;
  tableVersion: string;
  maxPollingAttempts?: number;
  shouldContinueAsNew?: boolean;
  basePollingPeriod?: number;
  pollingJitterCoefficient?: number;
  subscribedJourneys?: EnrichedJourney[];
}

async function processPollingPeriodBatch({
  workspaceId,
  tableVersion,
  currentTime,
}: {
  workspaceId: string;
  tableVersion: string;
  currentTime: number;
}) {
  const [subscribedJourneys, userProperties] = await Promise.all([
    findAllJourneysUnsafe({
      where: {
        workspaceId,
        status: "Running",
      },
    }),
    findAllUserProperties({
      workspaceId,
    }),
  ]);

  await computePropertiesPeriod({
    tableVersion,
    currentTime,
    workspaceId,
    subscribedJourneys,
    userProperties,
  });
}

async function useIncremental({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<boolean> {
  if (!wf.patched(FEATURE_INCREMENTAL_COMP)) {
    return false;
  }

  return getFeature({
    workspaceId,
    name: FEATURE_INCREMENTAL_COMP,
  });
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
      if (await useIncremental({ workspaceId })) {
        logger.info("Using incremental compute properties");
        const args = await computePropertiesIncrementalArgs({
          workspaceId,
        });
        await computePropertiesIncremental({
          ...args,
          now: currentTime,
        });
      } else {
        logger.info("Using batch compute properties");
        await processPollingPeriodBatch({
          workspaceId,
          tableVersion,
          currentTime,
        });
      }
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

    logger.debug("segmentsNotificationWorkflow sleeping completed", {
      period,
    });
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
