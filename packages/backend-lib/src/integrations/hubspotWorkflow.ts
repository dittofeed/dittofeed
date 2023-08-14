/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable no-await-in-loop */
import {
  continueAsNew,
  LoggerSinks,
  proxyActivities,
  proxySinks,
} from "@temporalio/workflow";
import * as wf from "@temporalio/workflow";

import { EnrichedJourney } from "../types";
// Only import the activity types
import type * as activities from "./hubspotWorkflow/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

const { getOauthToken, refreshToken } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export const hubspotJourneyInitialize = wf.defineSignal(
  "hubspotJourneyInitialize"
);

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

export const HUBSPOT_POLLING_JITTER_COEFFICIENT = 1000;

export async function hubspotWorkflow({
  workspaceId,
  shouldContinueAsNew = false,
  maxPollingAttempts = 1500,
  basePollingPeriod = REFRESH_WINDOW,
  pollingJitterCoefficient = HUBSPOT_POLLING_JITTER_COEFFICIENT,
}: HubspotWorkflowParams): Promise<HubspotWorkflowParams> {
  let token = await getOauthToken({ workspaceId });
  let tokenStale = false;

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

  wf.setHandler(hubspotJourneyInitialize, () => {
    logger.info("hubspot journey initialize signal", { workspaceId });
    tokenStale = true;
  });

  function getTimeToWait(jitter: number): number {
    if (!token) {
      throw new Error("no token to generate time to wait");
    }
    logger.info("getTimeToWait", { workspaceId, token });
    return Math.max(
      // time to wait until token expires
      token.expiresIn * 1000 -
        // time since token was created
        (Date.now() - (token.updatedAt ?? token.createdAt)) -
        // how much time to leave before token expires to refresh
        REFRESH_WINDOW -
        // add jitter to prevent thundering herd
        jitter * pollingJitterCoefficient,
      0
    );
  }

  for (let i = 0; i < maxPollingAttempts; i++) {
    const timeToWaitJitter = Math.random();
    const timeToWait = getTimeToWait(timeToWaitJitter);
    logger.info("hubspot polling period", {
      workspaceId,
      timeToWait,
    });
    await wf.condition(() => tokenStale, timeToWait);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (tokenStale) {
      token = await getOauthToken({ workspaceId });
      tokenStale = false;
      if (!token) {
        logger.info("no hubspot oauth token found, exiting", { workspaceId });
        return params;
      }
    } else if (getTimeToWait(timeToWaitJitter) <= 0) {
      logger.info("refreshing hubspot oauth token", { workspaceId });
      token = await refreshToken({ workspaceId, token: token.refreshToken });
    }

    // FIXME check if integration enabled
  }

  if (shouldContinueAsNew) {
    await continueAsNew<typeof hubspotWorkflow>(params);
  }
  return params;
}
