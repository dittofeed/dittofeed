import {
  makeWorkflowExporter,
  OpenTelemetryActivityInboundInterceptor,
} from "@temporalio/interceptors-opentelemetry/lib/worker";
import {
  appendDefaultInterceptors,
  defaultSinks,
  NativeConnection,
  Runtime,
  Worker,
  WorkerOptions,
} from "@temporalio/worker";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import * as activities from "backend-lib/src/temporal/activities";
import { CustomActivityInboundInterceptor } from "backend-lib/src/temporal/activityInboundInterceptor";
import connectWorkflowCLient from "backend-lib/src/temporal/connectWorkflowClient";
import workerLogger from "backend-lib/src/workerLogger";

import config from "./config";

export async function buildWorker() {
  Runtime.install({ logger: workerLogger });

  const [connection, workflowClient] = await Promise.all([
    NativeConnection.connect({
      address: backendConfig().temporalAddress,
    }),
    connectWorkflowCLient(),
  ]);

  const {
    maxConcurrentWorkflowTaskExecutions,
    maxConcurrentActivityTaskPolls,
    maxConcurrentWorkflowTaskPolls,
    taskQueue,
    maxCachedWorkflows,
    reuseContext: reuseV8Context,
  } = config();

  const opts: WorkerOptions = {
    connection,
    namespace: backendConfig().temporalNamespace,
    workflowsPath: require.resolve("backend-lib/src/temporal/workflows"),
    activities,
    sinks: {
      ...defaultSinks(workerLogger),
      exporter: makeWorkflowExporter(otel.traceExporter, otel.resource),
    },
    interceptors: appendDefaultInterceptors(
      {
        activityInbound: [
          (ctx) =>
            new CustomActivityInboundInterceptor(ctx, {
              workflowClient,
            }),
          (ctx) => new OpenTelemetryActivityInboundInterceptor(ctx),
        ],
      },
      workerLogger,
    ),
    enableSDKTracing: true,
    taskQueue,
  };

  if (reuseV8Context) {
    opts.reuseV8Context = reuseV8Context;
  }

  if (maxConcurrentWorkflowTaskExecutions) {
    opts.maxConcurrentWorkflowTaskExecutions =
      maxConcurrentWorkflowTaskExecutions;
  }

  if (maxConcurrentActivityTaskPolls) {
    opts.maxConcurrentActivityTaskPolls = maxConcurrentActivityTaskPolls;
  }

  if (maxConcurrentWorkflowTaskPolls) {
    opts.maxConcurrentWorkflowTaskPolls = maxConcurrentWorkflowTaskPolls;
  }

  if (maxCachedWorkflows) {
    opts.maxCachedWorkflows = maxCachedWorkflows;
  }

  const worker = await Worker.create(opts);

  logger().info(
    {
      opts,
    },
    "Worker created",
  );
  return worker;
}
