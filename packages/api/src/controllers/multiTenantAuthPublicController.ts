import rateLimit from "@fastify/rate-limit";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import {
  loginWithEmailPassword,
  LoginWithEmailPasswordErrorType,
  resolveAuthLoginMethods,
} from "backend-lib/src/memberPasswordAuth";
import { FastifyInstance } from "fastify";
import { OIDC_ID_TOKEN_COOKIE_NAME } from "isomorphic-lib/src/constants";
import {
  AuthLoginMethodsRequest,
  AuthLoginMethodsResponse,
  AuthPasswordLoginRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function multiTenantAuthPublicController(
  fastify: FastifyInstance,
) {
  if (backendConfig().authMode !== "multi-tenant") {
    return;
  }

  await fastify.register(rateLimit, {
    max: 40,
    timeWindow: "1 minute",
  });

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/login-methods",
    {
      schema: {
        description: "Discover whether password and/or OIDC login are available.",
        tags: ["Auth"],
        body: AuthLoginMethodsRequest,
        response: {
          200: AuthLoginMethodsResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await resolveAuthLoginMethods(request.body.email);
      return reply.status(200).send(result);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/password-login",
    {
      schema: {
        description: "Sign in with email and password (multi-tenant).",
        tags: ["Auth"],
        body: AuthPasswordLoginRequest,
        response: {
          204: EmptyResponse,
          401: EmptyResponse,
          403: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await loginWithEmailPassword(request.body);
      if (result.isErr()) {
        switch (result.error.type) {
          case LoginWithEmailPasswordErrorType.FeatureDisabled:
            return reply.status(403).send();
          case LoginWithEmailPasswordErrorType.NotOnboarded:
          case LoginWithEmailPasswordErrorType.EmailNotVerified:
            return reply.status(403).send();
          default:
            return reply.status(401).send();
        }
      }
      const cfg = backendConfig();
      reply.setCookie(OIDC_ID_TOKEN_COOKIE_NAME, result.value, {
        path: "/",
        httpOnly: true,
        secure: cfg.sessionCookieSecure,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });
      logger().debug({ email: request.body.email }, "password login cookie set");
      return reply.status(204).send();
    },
  );
}
