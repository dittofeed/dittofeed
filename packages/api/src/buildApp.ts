import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { NodeEnvEnum } from "backend-lib/src/config/loader";
import logger from "backend-lib/src/logger";
import fastify, { FastifyServerOptions } from "fastify";
import fastifyRawBody from "fastify-raw-body";
import { OpenAPIV3_1 } from "openapi-types";

import cors from "./buildApp/cors";
import router from "./buildApp/router";
import config from "./config";

async function buildApp() {
  const { nodeEnv } = config();
  let fastifyLogger: FastifyServerOptions["logger"];
  switch (nodeEnv) {
    case NodeEnvEnum.Development:
      fastifyLogger = {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      };
      break;
    case NodeEnvEnum.Production:
      fastifyLogger = logger();
      break;
    case NodeEnvEnum.Test:
      fastifyLogger = false;
      break;
  }
  const server = fastify({
    rewriteUrl: (req) => {
      const { apiPrefix } = config();
      if (!req.url) {
        return "";
      }

      if (!apiPrefix) {
        return req.url;
      }
      return req.url.replace(apiPrefix, "");
    },
    logger: fastifyLogger,
  }).withTypeProvider<TypeBoxTypeProvider>();

  let servers: OpenAPIV3_1.ServerObject[];
  switch (config().nodeEnv) {
    case "development":
      servers = [
        {
          url: "http://localhost",
        },
      ];
      break;
    default:
      servers = [];
  }

  // needs to be registered before fastifySwaggerUI
  await server.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Dittofeed API",
        description: "Interactive API documentation.",
        version: "0.0.0",
      },
      servers,
    },
  });

  // needs to be registered before routes
  await server.register(fastifyRawBody);

  await Promise.all([
    server.register(router),
    server.register(cors),
    server.register(fastifySwaggerUI, {
      routePrefix: "/documentation",
      staticCSP: true,
      uiConfig: {
        docExpansion: "full",
        deepLinking: true,
      },
    }),
  ]);

  server.addHook("onReady", () => {
    server.swagger();
  });

  return server;
}

export default buildApp;
