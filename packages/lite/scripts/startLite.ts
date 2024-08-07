// ensures types are imported to support single-tenant auth
import "@fastify/secure-session";

import {
  appendDefaultInterceptors,
  defaultSinks,
  NativeConnection,
  Runtime,
  Worker,
} from "@temporalio/worker";
import { BOOTSTRAP_OPTIONS } from "admin-cli/src/bootstrap";
import { startBootstrapWorkflow } from "backend-lib/src/journeys/bootstrap/lifecycle";
import buildApp from "api/src/buildApp";
import { requestToSessionValue } from "api/src/buildApp/requestContext";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import * as activities from "backend-lib/src/temporal/activities";
import { CustomActivityInboundInterceptor } from "backend-lib/src/temporal/activityInboundInterceptor";
import connectWorkflowCLient from "backend-lib/src/temporal/connectWorkflowClient";
import next from "next";
import path from "path";
import workerConfig from "worker/src/config";
import workerLogger from "worker/src/workerLogger";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import liteConfig from "../src/config";

function findPackagesDir(fullPath: string): string {
  // Normalize the path to handle different path separators
  const normalizedPath = path.normalize(fullPath);

  // Split the path into segments based on the platform-specific delimiter
  const segments = normalizedPath.split(path.sep);

  // Find the rightmost index of "packages" in the array where "lite" follows immediately after
  let lastPackagesIndex = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i] === "packages" && segments[i + 1] === "lite") {
      lastPackagesIndex = i;
      break;
    }
  }

  if (lastPackagesIndex === -1) {
    throw new Error("Could not find packages directory.");
  }

  // Return the path up to but not including "lite"
  const slicedSegments = segments.slice(0, lastPackagesIndex + 1); // "+1" to include "packages" but not "lite"
  return slicedSegments.join(path.sep);
}

async function startLite() {
  if (backendConfig().logConfig) {
    logger().info(
      {
        ...backendConfig(),
        ...liteConfig,
      },
      "Initialized with config",
    );
  }

  const app = await buildApp();

  if (liteConfig().bootstrap) {
    logger().info("Bootstrapping");
    const args = await yargs(hideBin(process.argv)).options(BOOTSTRAP_OPTIONS)
      .argv;

    await startBootstrapWorkflow(args);
  } else {
    logger().info("Skipping bootstrap");
  }

  const { port, host, nodeEnv } = liteConfig();

  const relativeDir = "dashboard";
  const packagesDir = findPackagesDir(__dirname);
  const dir = path.resolve(packagesDir, relativeDir);
  logger().debug(
    { dir, dirname: __dirname, packagesDir },
    "Next.js app directory",
  );

  const nextApp = next({
    dev: nodeEnv === "development",
    dir,
    customServer: true,
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
    url: "/*",
    handler: async (req, reply) => {
      // eslint-disable-next-line no-param-reassign
      req.raw.headers = {
        ...req.raw.headers,
        ...requestToSessionValue(req),
      };
      await nextHandler(req.raw, reply.raw);

      // eslint-disable-next-line no-param-reassign
      reply.sent = true;
    },
  });

  const worker = await Worker.create({
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
      workerLogger,
    ),
    reuseV8Context: workerConfig().reuseContext,
    maxCachedWorkflows: workerConfig().maxCachedWorkflows,
    enableSDKTracing: true,
  });

  await Promise.all([app.listen({ port, host }), worker.run()]);
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
