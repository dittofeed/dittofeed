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
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export const userJourneyInitialize = wf.defineSignal<[string]>(
  "userJourneyInitialize"
);

type JourneyMap = Map<string, boolean>;

export const BASE_POLLING_PERIOD = 10 * 1000;
export const POLLING_JITTER_COEFFICIENT = 1000;
export const MAX_POLLING_PERIOD =
  BASE_POLLING_PERIOD + POLLING_JITTER_COEFFICIENT;

export interface ComputedPropertiesWorkflowParams {
  workspaceId: string;
  tableVersion: string;
  lastProcessingTime?: number;
  maxPollingAttempts?: number;
  shouldContinueAsNew?: boolean;
  basePollingPeriod?: number;
  pollingJitterCoefficient?: number;
  subscribedJourneys?: EnrichedJourney[];
}

export async function computePropertiesWorkflow({
  tableVersion,
  workspaceId,
  lastProcessingTime,
  shouldContinueAsNew = false,
  maxPollingAttempts = 1500,
  basePollingPeriod = BASE_POLLING_PERIOD,
  pollingJitterCoefficient = POLLING_JITTER_COEFFICIENT,
  subscribedJourneys = [],
}: ComputedPropertiesWorkflowParams): Promise<ComputedPropertiesWorkflowParams> {
  let processingTimeUpperBound: number | null = null;
  let journeys = subscribedJourneys;

  for (let i = 0; i < maxPollingAttempts; i++) {
    const currentTime = Date.now();

    logger.info("segmentsNotificationWorkflow polling attempt", {
      i,
      currentTime,
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

    processingTimeUpperBound = await computePropertiesPeriod({
      tableVersion,
      currentTime,
      workspaceId,
      processingTimeLowerBound: lastProcessingTime,
      newComputedIds: Object.fromEntries(newJourneysDiff),
      subscribedJourneys: journeys,
      userProperties,
    });

    // sleep for 10 seconds + up to 1 seconds of jitter for next polling period
    await sleep(basePollingPeriod + Math.random() * pollingJitterCoefficient);
  }

  const newLastProcessingTime = processingTimeUpperBound ?? lastProcessingTime;

  const params: ComputedPropertiesWorkflowParams = {
    maxPollingAttempts,
    tableVersion,
    workspaceId,
    lastProcessingTime: newLastProcessingTime,
    subscribedJourneys: journeys,
  };
  if (shouldContinueAsNew) {
    await continueAsNew<typeof computePropertiesWorkflow>(params);
  }
  return params;
}
