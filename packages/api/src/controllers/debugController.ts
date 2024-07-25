import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import logger from "backend-lib/src/logger";
import { FastifyInstance } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function debugController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/boom",
    {
      schema: {
        description: "Boom endpoint for throwing errors and testing telemetry.",
      },
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
      logger().error("boom!");
      throw new Error("boom!");
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/ok",
    {
      schema: {
        description: "Ok endpoint for testing telemetry.",
      },
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
      logger().info("my ok message!");
      return { ok: true };
    },
  );
}
