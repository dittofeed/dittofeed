import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { FastifyInstance } from "fastify";
import {
  GetSegmentsRequest,
  GetSegmentsResponse,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function resourcesController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Get all resource handles.",
        tags: ["Resources"],
        querystring: GetSegmentsRequest,
        response: {
          200: GetSegmentsResponse,
        },
      },
    },
    async (request, reply) => {
      return reply.status(200).send();
    },
  );
}
