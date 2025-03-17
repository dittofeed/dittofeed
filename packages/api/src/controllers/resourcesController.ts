import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { getResources } from "backend-lib/src/resources";
import { FastifyInstance } from "fastify";
import {
  GetResourcesRequest,
  GetResourcesResponse,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function resourcesController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Get a list of all resources by name and id.",
        tags: ["Resources"],
        querystring: GetResourcesRequest,
        response: {
          200: GetResourcesResponse,
        },
      },
    },
    async (request, reply) => {
      const response = await getResources(request.query);
      return reply.status(200).send(response);
    },
  );
}
