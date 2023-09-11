import buildApp from "api/src/buildApp";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";

import liteConfig from "../src/config";

async function startLite() {
  if (backendConfig().logConfig) {
    logger().info(
      {
        ...backendConfig(),
        ...liteConfig,
      },
      "Initialized with config"
    );
  }
  const app = await buildApp();
  const { port, host } = liteConfig();

  await app.listen({ port, host });
}

startLite()
  .then(() => {
    console.log("Lite started");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
