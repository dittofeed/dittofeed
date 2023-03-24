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
} from "@temporalio/worker";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import { initOpenTelemetry } from "backend-lib/src/openTelemetry";
import * as activities from "backend-lib/src/temporal/activities";
import { CustomActivityInboundInterceptor } from "backend-lib/src/temporal/activityInboundInterceptor";
import connectWorkflowCLient from "backend-lib/src/temporal/connectWorkflowClient";

import config from "../src/config";
import workerLogger from "../src/workerLogger";

async function run() {
  const workerConfig = config();

  if (backendConfig().logConfig) {
    logger().info(
      {
        ...backendConfig(),
        ...workerConfig,
      },
      "Initialized with config"
    );
  }
  const otel = initOpenTelemetry({
    serviceName: workerConfig.workerServiceName,
  });

  Runtime.install({ logger: workerLogger });

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
      workerLogger
    ),
    enableSDKTracing: true,
  });

  await otel.start();
  await worker.run();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
