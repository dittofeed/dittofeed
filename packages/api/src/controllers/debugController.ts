import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { trace, context } from "@opentelemetry/api";
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
      return withSpan({ name: "my ok span!" }, async () => {
        const span = trace.getSpan(context.active());
        logger().info(
          {
            activeSpan: span,
          },
          "my ok message!",
        );
        return { ok: true };
      });
    },
  );
}
