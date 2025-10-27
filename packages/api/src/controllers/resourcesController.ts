import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { duplicateResource, getResources } from "backend-lib/src/resources";
import { FastifyInstance } from "fastify";
import {
  DuplicateResourceError,
  DuplicateResourceRequest,
  DuplicateResourceResponse,
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

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/duplicate",
    {
      schema: {
        description: "Duplicate a resource with a new unique name.",
        tags: ["Resources"],
        body: DuplicateResourceRequest,
        response: {
          200: DuplicateResourceResponse,
          400: DuplicateResourceError,
        },
      },
    },
    async (request, reply) => {
      const result = await duplicateResource(request.body);
      if (result.isErr()) {
        return reply.status(400).send(result.error);
      }
      return reply.status(200).send(result.value);
    },
  );
}
