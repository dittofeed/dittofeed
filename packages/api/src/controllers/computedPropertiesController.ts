import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  getComputedPropertyPeriods,
  triggerWorkspaceRecompute,
} from "backend-lib/src/computedProperties/periods";
import { FastifyInstance } from "fastify";
import {
  EmptyResponse,
  GetComputedPropertyPeriodsRequest,
  GetComputedPropertyPeriodsResponse,
  TriggerRecomputeRequest,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function computedPropertiesController(
  fastify: FastifyInstance,
) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/periods",
    {
      schema: {
        description: "Get computed property periods by computed property id.",
        tags: ["Computed Properties"],
        querystring: GetComputedPropertyPeriodsRequest,
        response: {
          200: GetComputedPropertyPeriodsResponse,
        },
      },
    },
    async (request, reply) => {
      const periods = await getComputedPropertyPeriods(request.query);
      return reply.status(200).send(periods);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post("/trigger-recompute", {
    schema: {
      description: "Trigger a computed property recomputation.",
      body: TriggerRecomputeRequest,
      response: {
        200: EmptyResponse,
      },
    },
    handler: async (request, reply) => {
      await triggerWorkspaceRecompute({
        workspaceId: request.body.workspaceId,
      });
      return reply.status(200).send();
    },
  });
}
