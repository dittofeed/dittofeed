// eslint-disable-next-line import/no-extraneous-dependencies
import { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  appendDefaultInterceptors,
  defaultSinks,
  Worker,
} from "@temporalio/worker";
import path from "path";

import * as activities from "../src/temporal/activities";
import { CustomActivityInboundInterceptor } from "../src/temporal/activityInboundInterceptor";
import workerLogger from "../src/workerLogger";

export async function createEnvAndWorker({
  activityOverrides,
}: {
  activityOverrides?: Parameters<typeof Worker.create>[0]["activities"];
} = {}) {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();

  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    workflowsPath: require.resolve(
      path.join(__dirname, "..", "src/temporal/workflows"),
    ),
    interceptors: appendDefaultInterceptors(
      {
        activityInbound: [
          (ctx) =>
            new CustomActivityInboundInterceptor(ctx, {
              workflowClient: testEnv.client.workflow,
            }),
        ],
      },
      workerLogger,
    ),
    activities: { ...activities, ...activityOverrides },
    sinks: defaultSinks(workerLogger),
    taskQueue: "default",
  });
  return { testEnv, worker };
}
