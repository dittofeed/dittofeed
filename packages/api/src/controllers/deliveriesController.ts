import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { searchDeliveries } from "backend-lib/src/deliveries";
import {
  SearchDeliveriesRequest,
  SearchDeliveriesResponse,
} from "backend-lib/src/types";
import { FastifyInstance } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function deliveriesController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Search through deliveries.",
        tags: ["Deliveries"],
        querystring: SearchDeliveriesRequest,
        response: {
          200: SearchDeliveriesResponse,
        },
      },
    },
    async (request, reply) => {
      const deliveries = await searchDeliveries(request.query);
      return reply.status(200).send(deliveries);
    },
  );
}
