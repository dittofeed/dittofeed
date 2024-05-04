import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";

import config from "../src/config";
import { initApiOpenTelemetry } from "../src/openTelemetry";

const apiConfig = config();
const { apiPort: port, apiHost: host } = apiConfig;

// README: open telemetry instrumentation has to be imported before buildApp, because it patches fastify
const otel = initApiOpenTelemetry();

// eslint-disable-next-line import/first
import buildApp from "../src/buildApp";

async function start() {
  if (backendConfig().logConfig) {
    logger().info(
      {
        ...backendConfig(),
        ...apiConfig,
      },
      "Initialized with config",
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
