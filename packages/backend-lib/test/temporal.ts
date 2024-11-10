// eslint-disable-next-line import/no-extraneous-dependencies
import { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  appendDefaultInterceptors,
  defaultSinks,
  Worker,
} from "@temporalio/worker";

import logger from "../src/logger";
import * as activities from "../src/temporal/activities";
import { CustomActivityInboundInterceptor } from "../src/temporal/activityInboundInterceptor";

const EMPTY_LOGGER = {
  log() {},
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export async function createEnvAndWorker({
  activityOverrides,
}: {
  activityOverrides?: Parameters<typeof Worker.create>[0]["activities"];
} = {}) {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    workflowsPath: require.resolve("../src/temporal/workflows"),
    interceptors: appendDefaultInterceptors(
      {
        activityInbound: [
          (ctx) =>
            new CustomActivityInboundInterceptor(ctx, {
              workflowClient: testEnv.client.workflow,
            }),
        ],
      },
      EMPTY_LOGGER,
    ),
    activities: { ...activities, ...activityOverrides },
    taskQueue: "default",
    sinks: defaultSinks(EMPTY_LOGGER),
  });
  return { testEnv, worker };
}
