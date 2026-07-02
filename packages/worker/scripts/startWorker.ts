import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import { runRealtimeSegmentsWorker } from "backend-lib/src/realtimeSegments/worker";

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
  const worker = await buildWorker(otel);
  otel.start();

  await Promise.all([
    worker.run(),
    backendConfig().realtimeSegmentsEnabled
      ? runRealtimeSegmentsWorker()
      : Promise.resolve(),
  ]);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
