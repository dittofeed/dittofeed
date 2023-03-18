import {
  makeWorkflowExporter,
  OpenTelemetryActivityInboundInterceptor,
} from "@temporalio/interceptors-opentelemetry/lib/worker";
import {
  appendDefaultInterceptors,
  defaultSinks,
  NativeConnection,
  Worker,
} from "@temporalio/worker";
import backendConfig from "backend-lib/src/config";
import { initOpenTelemetry } from "backend-lib/src/openTelemetry";
import * as activities from "backend-lib/src/temporal/activities";
import { CustomActivityInboundInterceptor } from "backend-lib/src/temporal/activityInboundInterceptor";
import connectWorkflowCLient from "backend-lib/src/temporal/connectWorkflowClient";

import config from "../src/config";

async function run() {
  const otel = initOpenTelemetry({
    serviceName: config().workerServiceName,
  });

  const [connection, workflowClient] = await Promise.all([
    NativeConnection.connect({
      address: backendConfig().temporalAddress,
    }),
    connectWorkflowCLient(),
  ]);

  const worker = await Worker.create({
    connection,
    namespace: backendConfig().temporalNamespace,
    workflowsPath: require.resolve("backend-lib/src/temporal/workflows"),
    activities,
    taskQueue: "default",
    sinks: {
      ...defaultSinks,
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
      console
    ),
    enableSDKTracing: true,
  });
  await otel.start();
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
