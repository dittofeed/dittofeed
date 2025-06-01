import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  getTimeLimitedCache,
  setTimeLimitedCache,
} from "backend-lib/src/timeLimitedCache";
import { FastifyInstance } from "fastify";
import {
  EmptyResponse,
  GetTimeLimitedCacheRequest,
  GetTimeLimitedCacheResponse,
  SetTimeLimitedCacheRequest,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function timeLimitedCacheController(
  fastify: FastifyInstance,
) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/set",
    {
      schema: {
        description: "Set a value in the time-limited cache.",
        tags: ["TimeLimitedCache"],
        body: SetTimeLimitedCacheRequest,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      await setTimeLimitedCache(request.body);
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/get",
    {
      schema: {
        description: "Get a value from the time-limited cache.",
        tags: ["TimeLimitedCache"],
        querystring: GetTimeLimitedCacheRequest,
        response: {
          200: GetTimeLimitedCacheResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await getTimeLimitedCache(request.query);
      if (!result) {
        return reply.status(404).send();
      }
      return reply.status(200).send(result);
    },
  );
}
