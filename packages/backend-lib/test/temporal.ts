// eslint-disable-next-line import/no-extraneous-dependencies
import { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  appendDefaultInterceptors,
  DefaultLogger,
  defaultSinks,
  LogLevel,
  Runtime,
  Worker,
} from "@temporalio/worker";

import config from "../src/config";
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
  let logLevel: LogLevel;
  switch (config().logLevel) {
    case "error":
      logLevel = "ERROR";
      break;
    case "warn":
      logLevel = "WARN";
      break;
    case "info":
      logLevel = "INFO";
      break;
    case "debug":
      logLevel = "DEBUG";
      break;
    case "trace":
      logLevel = "TRACE";
      break;
    default:
      logLevel = "INFO";
  }
  const temporalLogger = new DefaultLogger(logLevel, (entry) => {
    logger()[entry.level]?.(entry.meta, entry.message);
  });
  Runtime.install({ logger: temporalLogger });

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
  });
  return { testEnv, worker };
}
