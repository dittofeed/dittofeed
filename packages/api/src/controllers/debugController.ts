import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import logger from "backend-lib/src/logger";
import { withSpan } from "backend-lib/src/openTelemetry";
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
      // eslint-disable-next-line @typescript-eslint/require-await
      return withSpan({ name: "my ok span!" }, async () => {
        logger().info("my ok message!");
        return { ok: true };
      });
    },
  );
}
