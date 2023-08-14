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
import type * as activities from "./hubspotWorkflow/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

const { getOauthToken, refreshToken } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

// FIXME
// export const userJourneyInitialize = wf.defineSignal<[string]>(
//   "userJourneyInitialize"
// );

export function generateId(workspaceId: string) {
  return `hubspot-${workspaceId}`;
}

// 5 mins in ms
export const REFRESH_WINDOW = 5 * 60 * 1000;

interface HubspotWorkflowParams {
  workspaceId: string;
  maxPollingAttempts?: number;
  shouldContinueAsNew?: boolean;
  basePollingPeriod?: number;
  pollingJitterCoefficient?: number;
  subscribedJourneys?: EnrichedJourney[];
}

export const POLLING_JITTER_COEFFICIENT = 1000;

export async function hubspotWorkflow({
  workspaceId,
  shouldContinueAsNew = false,
  maxPollingAttempts = 1500,
  basePollingPeriod = REFRESH_WINDOW,
  pollingJitterCoefficient = POLLING_JITTER_COEFFICIENT,
}: HubspotWorkflowParams): Promise<HubspotWorkflowParams> {
  let token = await getOauthToken({ workspaceId });

  const params: HubspotWorkflowParams = {
    basePollingPeriod,
    maxPollingAttempts,
    pollingJitterCoefficient,
    shouldContinueAsNew,
    workspaceId,
  };

  if (!token) {
    logger.info("no hubspot oauth token found, exiting", { workspaceId });
    return params;
  }

  for (let i = 0; i < maxPollingAttempts; i++) {
    await sleep(
      Math.max(
        token.expiresIn * 1000 -
          REFRESH_WINDOW -
          Math.random() * pollingJitterCoefficient,
        0
      )
    );
    // FIXME check if integration enabled
    token = await refreshToken({ workspaceId, token: token.refreshToken });
  }

  if (shouldContinueAsNew) {
    await continueAsNew<typeof hubspotWorkflow>(params);
  }
  return params;
}
