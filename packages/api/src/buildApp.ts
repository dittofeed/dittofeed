import fastifyCookie from "@fastify/cookie";
import { fastifyRequestContext } from "@fastify/request-context";
import secureSession from "@fastify/secure-session";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import backendConfig from "backend-lib/src/config";
import { trimTo32Bytes } from "backend-lib/src/crypto";
import logger from "backend-lib/src/logger";
import { DittofeedFastifyInstance, Logger } from "backend-lib/src/types";
import fastify, { FastifyHttpOptions, RawServerDefault } from "fastify";
import { TYPE_REFS } from "isomorphic-lib/src/typeRefs";
import {
  DFRequestContext,
  PUBLIC_WRITE_KEY_DESCRIPTION,
} from "isomorphic-lib/src/types";
import { OpenAPIV3_1 } from "openapi-types";
import qs from "qs";

import cors from "./buildApp/cors";
import multipart from "./buildApp/multipart";
import router from "./buildApp/router";
import config from "./config";
import { BuildAppOpts } from "./types";

declare module "@fastify/request-context" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface RequestContextData extends DFRequestContext {}
}

export type FastifyAppOpts = FastifyHttpOptions<RawServerDefault, Logger>;

export function buildFastifyAppOpts(): FastifyAppOpts {
  const fastifyLogger = logger();
  const rewriteUrl: FastifyAppOpts["rewriteUrl"] = function rewriteUrl(req) {
    const { apiPrefix } = config();
    if (!req.url) {
      return "";
    }

    if (!apiPrefix) {
      return req.url;
    }
    return req.url.replace(apiPrefix, "");
  };
  return {
    bodyLimit: config().apiBodyLimit,
    querystringParser: (str: string) => qs.parse(str),
    rewriteUrl,
    logger: fastifyLogger,
  } satisfies FastifyAppOpts;
}

export async function registerApp(
  originalServer: DittofeedFastifyInstance,
  opts?: BuildAppOpts,
) {
  const server = originalServer.withTypeProvider<TypeBoxTypeProvider>();

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
      components: {
        securitySchemes: {
          publicWriteKey: {
            type: "apiKey",
            description: PUBLIC_WRITE_KEY_DESCRIPTION,
            name: "PublicWriteKey",
            in: "header",
          },
        },
      },
      servers,
    },
  });

  TYPE_REFS.forEach((schema) => {
    server.addSchema(schema);
  });

  // needs to be registered before routes
  const fastifyPluginPromises: PromiseLike<unknown>[] = [
    server.register(fastifyRequestContext),
    server.register(fastifyCookie),
    server.register(multipart),
  ];

  const { authMode, secretKey, sessionCookieSecure } = backendConfig();

  if (opts?.extendPlugins) {
    logger().info("extending plugins");
    await opts.extendPlugins(server);
  }

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
          secure: sessionCookieSecure,
        },
      }),
    );
  }

  await Promise.all(fastifyPluginPromises);

  await Promise.all([
    server.register((f) => router(f, opts)),
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

async function buildApp(opts?: BuildAppOpts) {
  const server = fastify(buildFastifyAppOpts());
  await registerApp(server, opts);
  return server;
}

export default buildApp;
