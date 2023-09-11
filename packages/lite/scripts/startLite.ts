import buildApp from "api/src/buildApp";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import next from "next";
import path from "path";

import liteConfig from "../src/config";

// FIXME include admin cli
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
  const { port, host, nodeEnv } = liteConfig();

  const nextApp = next({
    dev: nodeEnv === "development",
    dir: path.resolve(__dirname, path.join("..", "..", "dashboard")),
  });
  const nextHandler = nextApp.getRequestHandler();

  await nextApp.prepare();

  app.all("*", async (req, reply) => {
    await nextHandler(req.raw, reply.raw);
    // eslint-disable-next-line no-param-reassign
    reply.sent = true;
  });

  await app.listen({ port, host });
}

startLite()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log("dittofeed-lite started");
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
