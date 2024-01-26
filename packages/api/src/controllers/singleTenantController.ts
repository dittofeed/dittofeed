import { Type, TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import { SESSION_KEY } from "backend-lib/src/requestContext";
import { FastifyInstance } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function authController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/login",
    {
      schema: {
        description: "Login in single-tenant auth mode.",
        body: Type.Object({
          password: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const { password, authMode } = backendConfig();
      if (authMode !== "single-tenant") {
        return reply.status(404).send();
      }

      if (!password?.length) {
        logger().error("No password configured in single tenant mode.");
        return reply.status(500).send({
          error: "Application is misconfigured, contact support.",
        });
      }

      if (request.body.password !== password) {
        return reply.status(401).send({
          error: "Invalid password.",
        });
      }
      request.session.set(SESSION_KEY, true);
      return reply.status(200).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/signout",
    {
      schema: {
        description: "Signout in single-tenant auth mode.",
      },
    },
    async (request, reply) => {
      const { authMode } = backendConfig();
      if (authMode !== "single-tenant") {
        return reply.status(404).send();
      }
      request.session.delete();
      return reply.redirect(302, "/dashboard/auth/single-tenant");
    },
  );
}
