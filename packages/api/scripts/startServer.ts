import { initOpenTelemetry } from "backend-lib/src/openTelemetry";

import config from "../src/config";

const { apiPort: port, apiHost: host, serviceName } = config();

// README: open telemetry instrumentation has to be imported before buildApp, because it patches fastify
const startOpentelemetry = initOpenTelemetry({ serviceName });

// eslint-disable-next-line import/first
import buildApp from "../src/buildApp";

async function start() {
  const app = await buildApp();
  await startOpentelemetry();
  await app.listen({ port, host });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
