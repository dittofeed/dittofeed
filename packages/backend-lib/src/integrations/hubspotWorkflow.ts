/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable no-await-in-loop */
import {
  continueAsNew,
  LoggerSinks,
  proxyActivities,
  proxySinks,
} from "@temporalio/workflow";
import * as wf from "@temporalio/workflow";

import { JsonResultType } from "../types";
// Only import the activity types
import type * as activities from "./hubspot/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

const { getOauthToken, refreshToken, getIntegrationEnabled } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

export const hubspotWorkflowInitialize = wf.defineSignal(
  "hubspotWorkflowInitialize",
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
}

export const HUBSPOT_POLLING_JITTER_COEFFICIENT = 1000;

export async function hubspotWorkflow({
  workspaceId,
  shouldContinueAsNew = false,
  maxPollingAttempts = 1500,
  basePollingPeriod = REFRESH_WINDOW,
  pollingJitterCoefficient = HUBSPOT_POLLING_JITTER_COEFFICIENT,
}: HubspotWorkflowParams): Promise<HubspotWorkflowParams> {
  logger.info("hubspot workflow", { workspaceId });
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

  wf.setHandler(hubspotWorkflowInitialize, () => {
    logger.info("hubspot workflow initialize signal", { workspaceId });
    tokenStale = true;
  });

  function getTimeToWait(jitter: number): number {
    if (!token) {
      throw new Error("no token to generate time to wait");
    }
    const timeSinceTokenUpdate =
      Date.now() - (token.updatedAt ?? token.createdAt);
    const waitTime = Math.max(
      // time to wait until token expires
      token.expiresIn * 1000 -
        // time since token was created
        timeSinceTokenUpdate -
        // how much time to leave before token expires to refresh
        REFRESH_WINDOW -
        // add jitter to prevent thundering herd
        jitter * pollingJitterCoefficient,
      0,
    );
    logger.info("hubspot getTimeToWait", {
      workspaceId,
      waitTime,
      expires: token.expiresIn * 1000,
      timeSinceTokenUpdate,
      jitter,
    });
    return waitTime;
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
      const refreshedToken = await refreshToken({
        workspaceId,
      });
      if (refreshedToken.type === JsonResultType.Ok) {
        token = refreshedToken.value;
      }
    }
    if (!(await getIntegrationEnabled({ workspaceId }))) {
      logger.info("hubspot integration disabled, exiting", { workspaceId });
      break;
    }
  }

  if (shouldContinueAsNew) {
    await continueAsNew<typeof hubspotWorkflow>(params);
  }
  return params;
}
