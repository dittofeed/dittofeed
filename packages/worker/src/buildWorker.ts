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
import { OpenTelemetry } from "backend-lib/src/openTelemetry";
import * as activities from "backend-lib/src/temporal/activities";
import { CustomActivityInboundInterceptor } from "backend-lib/src/temporal/activityInboundInterceptor";
import connectWorkflowCLient from "backend-lib/src/temporal/connectWorkflowClient";
import { DittofeedWorkflowInboundInterceptor } from "backend-lib/src/temporal/workflowInboundCallsInterceptor";
import workerLogger from "backend-lib/src/workerLogger";

import config from "./config";

export async function buildWorker(otel?: OpenTelemetry) {
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
    useTemporalVersioning,
    maxConcurrentActivityTaskExecutions,
    maxConcurrentLocalActivityExecutions,
  } = config();

  const sinks: WorkerOptions["sinks"] = {
    ...defaultSinks(workerLogger),
  };
  if (otel) {
    sinks.exporter = makeWorkflowExporter(otel.traceExporter, otel.resource);
  }
  const opts: WorkerOptions = {
    connection,
    namespace: backendConfig().temporalNamespace,
    workflowsPath: require.resolve("backend-lib/src/temporal/workflows"),
    activities,
    sinks,
    interceptors: appendDefaultInterceptors(
      {
        activityInbound: [
          (ctx) =>
            new CustomActivityInboundInterceptor(ctx, {
              workflowClient,
            }),
          (ctx) => new OpenTelemetryActivityInboundInterceptor(ctx),
        ],
        workflowModules: [require.resolve("backend-lib/src/temporal/workflowInboundCallsInterceptor")],
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

  if (maxConcurrentActivityTaskExecutions) {
    opts.maxConcurrentActivityTaskExecutions =
      maxConcurrentActivityTaskExecutions;
  }

  if (maxConcurrentLocalActivityExecutions) {
    opts.maxConcurrentLocalActivityExecutions =
      maxConcurrentLocalActivityExecutions;
  }

  const { appVersion } = backendConfig();
  if (appVersion && useTemporalVersioning) {
    opts.buildId = appVersion;
    opts.useVersioning = true;
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
