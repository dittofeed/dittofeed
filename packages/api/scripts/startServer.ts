import {
  ExplicitBucketHistogramAggregation,
  InstrumentType,
  View,
} from "@opentelemetry/sdk-metrics";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import { initOpenTelemetry } from "backend-lib/src/openTelemetry";

import config from "../src/config";
import telemetryConfig from "../src/telemetryConfig";

const apiConfig = config();
const { apiPort: port, apiHost: host, apiServiceName: serviceName } = apiConfig;

// README: open telemetry instrumentation has to be imported before buildApp, because it patches fastify
const otel = initOpenTelemetry({
  serviceName,
  configOverrides: telemetryConfig,
  meterProviderViews: [
    new View({
      aggregation: new ExplicitBucketHistogramAggregation([200, 300, 400, 500]),
      instrumentName: "api-statuses",
      instrumentType: InstrumentType.HISTOGRAM,
    }),
  ],
});

// eslint-disable-next-line import/first
import buildApp from "../src/buildApp";

async function start() {
  if (backendConfig().logConfig) {
    logger().info(
      {
        ...backendConfig(),
        ...apiConfig,
      },
      "Initialized with config"
    );
  }

  otel.start();

  const app = await buildApp();
  await app.listen({ port, host });
}

start().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
