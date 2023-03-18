import { startOpentelemetry } from "backend-lib/src/openTelemetry";

import buildApp from "../src/buildApp";
import config from "../src/config";

async function start() {
  const app = await buildApp();
  const { apiPort: port, apiHost: host, serviceName } = config();
  await app.listen({ port, host });
  await startOpentelemetry({ serviceName });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
