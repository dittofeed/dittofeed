import { fastifyRequestContext } from "@fastify/request-context";
import secureSession from "@fastify/secure-session";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import backendConfig from "backend-lib/src/config";
import { trimTo32Bytes } from "backend-lib/src/crypto";
import logger from "backend-lib/src/logger";
import fastify from "fastify";
import fastifyRawBody from "fastify-raw-body";
import { DFRequestContext } from "isomorphic-lib/src/types";
import { OpenAPIV3_1 } from "openapi-types";
import qs from "qs";

import cors from "./buildApp/cors";
import router from "./buildApp/router";
import config from "./config";

declare module "@fastify/request-context" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface RequestContextData extends DFRequestContext {}
}

async function buildApp() {
  const fastifyLogger = logger();
  const server = fastify({
    querystringParser: (str) => qs.parse(str),
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
      openapi: "3.1.0",
      info: {
        title: "Dittofeed API",
        description: "Dittofeed API Swagger Documentation",
        version: "0.0.1",
      },
      servers,
    },
  });

  // needs to be registered before routes
  const fastifyPluginPromises: PromiseLike<unknown>[] = [
    server.register(fastifyRawBody),
    server.register(fastifyRequestContext),
  ];

  const { authMode, secretKey } = backendConfig();

  if (authMode === "single-tenant") {
    if (!secretKey) {
      throw new Error("SECRET_KEY must be set in single-tenant mode.");
    }
    fastifyPluginPromises.push(
      server.register(secureSession, {
        key: trimTo32Bytes(secretKey),
        cookie: {
          path: "/",
          maxAge: 14 * 24 * 60 * 60,
          httpOnly: true,
          secure: config().nodeEnv === "production",
        },
      }),
    );
  }

  await Promise.all(fastifyPluginPromises);

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
