import {
  appendDefaultInterceptors,
  defaultSinks,
  NativeConnection,
  Runtime,
  Worker,
} from "@temporalio/worker";
import buildApp from "api/src/buildApp";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import * as activities from "backend-lib/src/temporal/activities";
import { CustomActivityInboundInterceptor } from "backend-lib/src/temporal/activityInboundInterceptor";
import connectWorkflowCLient from "backend-lib/src/temporal/connectWorkflowClient";
import next from "next";
import path from "path";
import workerConfig from "worker/src/config";
import workerLogger from "worker/src/workerLogger";

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
  const { port, host, nodeEnv } = liteConfig();

  const nextApp = next({
    dev: nodeEnv === "development",
    dir: path.resolve(__dirname, path.join("..", "..", "dashboard")),
  });
  const nextHandler = nextApp.getRequestHandler();

  Runtime.install({ logger: workerLogger });

  const [connection, workflowClient] = await Promise.all([
    NativeConnection.connect({
      address: backendConfig().temporalAddress,
    }),
    connectWorkflowCLient(),
    nextApp.prepare(),
  ]);

  app.route({
    // Exclude 'OPTIONS to avoid conflict with cors plugin'
    method: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
    url: "*",
    handler: async (req, reply) => {
      await nextHandler(req.raw, reply.raw);
      // eslint-disable-next-line no-param-reassign
      reply.sent = true;
    },
  });

  await Worker.create({
    connection,
    namespace: backendConfig().temporalNamespace,
    workflowsPath: require.resolve("backend-lib/src/temporal/workflows"),
    activities,
    taskQueue: "default",
    sinks: {
      ...defaultSinks(workerLogger),
    },
    interceptors: appendDefaultInterceptors(
      {
        activityInbound: [
          (ctx) =>
            new CustomActivityInboundInterceptor(ctx, {
              workflowClient,
            }),
        ],
      },
      workerLogger
    ),
    reuseV8Context: workerConfig().reuseContext,
    maxCachedWorkflows: workerConfig().maxCachedWorkflows,
    enableSDKTracing: true,
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
