import { initOpenTelemetry } from "backend-lib/src/openTelemetry";

import config from "../src/config";
import telemetryConfig from "../src/telemetryConfig";

const { apiPort: port, apiHost: host, apiServiceName: serviceName } = config();

// README: open telemetry instrumentation has to be imported before buildApp, because it patches fastify
const otel = initOpenTelemetry({
  serviceName,
  configOverrides: telemetryConfig,
});

// eslint-disable-next-line import/first
import buildApp from "../src/buildApp";

async function start() {
  const app = await buildApp();
  await otel.start();
  await app.listen({ port, host });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
