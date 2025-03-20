import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";

import { buildWorker } from "../src/buildWorker";
import config from "../src/config";
import { initWorkerOpenTelemetry } from "../src/openTelemetry";

async function run() {
  const workerConfig = config();

  if (backendConfig().logConfig) {
    logger().info(
      {
        ...backendConfig(),
        ...workerConfig,
      },
      "Initialized with config",
    );
  }

  const otel = initWorkerOpenTelemetry();
  const worker = await buildWorker();
  otel.start();

  await worker.run();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
