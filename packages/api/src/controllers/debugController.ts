import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
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
      throw new Error("boom!");
    },
  );
}
