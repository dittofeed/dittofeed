import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import logger from "backend-lib/src/logger";
import fastify from "fastify";
import fastifyRawBody from "fastify-raw-body";
import { OpenAPIV3_1 } from "openapi-types";

import cors from "./buildApp/cors";
import router from "./buildApp/router";
import config from "./config";
import apiMetrics from "./buildApp/apiMetrics";

async function buildApp() {
  const fastifyLogger = logger();
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
    server.register(apiMetrics),
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
