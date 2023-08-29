/* eslint-disable no-await-in-loop */
import {
  continueAsNew,
  LoggerSinks,
  proxyActivities,
  proxySinks,
  sleep,
} from "@temporalio/workflow";
import * as wf from "@temporalio/workflow";

import { EnrichedJourney } from "../types";
// Only import the activity types
import type * as activities from "./computePropertiesWorkflow/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

const {
  computePropertiesPeriod,
  findAllJourneysUnsafe,
  findAllUserProperties,
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

type JourneyMap = Map<string, boolean>;

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
  let journeys = subscribedJourneys;

  for (let i = 0; i < maxPollingAttempts; i++) {
    try {
      const currentTime = Date.now();

      logger.info("segmentsNotificationWorkflow polling attempt", {
        i,
        currentTime,
        maxPollingAttempts,
      });

      /**
       * scenarios, at query time:
       *  1. new journey is NotStarted
       *  2. new journey is Running
       *  3. new journey is Paused
       *
       * handling:
       *  1. NotStarted journeys should be filtered out with db query
       *  2. Running journeys should be handled as normal
       *  3. Paused journeys should be removed from subscribed journeys, so that on subsequent queries they are entirely refreshed
       */
      const [latestSubscribedJourneys, userProperties] = await Promise.all([
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

      const newJourneysDiff: JourneyMap =
        latestSubscribedJourneys.reduce<JourneyMap>((memo, journey) => {
          memo.set(journey.id, true);
          return memo;
        }, new Map());

      journeys.forEach((j) => {
        newJourneysDiff.delete(j.id);
      });

      journeys = latestSubscribedJourneys;

      await computePropertiesPeriod({
        tableVersion,
        currentTime,
        workspaceId,
        newComputedIds: Object.fromEntries(newJourneysDiff),
        subscribedJourneys: journeys,
        userProperties,
      });
    } catch (e) {
      logger.error("computePropertiesWorkflow failed to re-compute", {
        err: e,
      });
    }

    const { computePropertiesInterval } = await config([
      "computePropertiesInterval",
    ]);

    // only use override if shouldContinueAsNew is false, in order to allow value
    // to be reconfigured at deploy time
    const basePollingInterval =
      shouldContinueAsNew || !basePollingPeriodOverride
        ? computePropertiesInterval
        : basePollingPeriodOverride;

    // sleep for 10 seconds + up to 1 seconds of jitter for next polling period
    await sleep(basePollingInterval + Math.random() * pollingJitterCoefficient);
  }

  const params: ComputedPropertiesWorkflowParams = {
    basePollingPeriod: basePollingPeriodOverride,
    maxPollingAttempts,
    pollingJitterCoefficient,
    shouldContinueAsNew,
    subscribedJourneys: journeys,
    tableVersion,
    workspaceId,
  };

  if (shouldContinueAsNew) {
    await continueAsNew<typeof computePropertiesWorkflow>(params);
  }
  return params;
}
