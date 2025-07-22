import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  buildDeliveriesFile,
  searchDeliveries,
} from "backend-lib/src/deliveries";
import {
  DownloadDeliveriesRequest,
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

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/download",
    {
      schema: {
        description: "Download a csv containing deliveries.",
        tags: ["Deliveries"],
        querystring: DownloadDeliveriesRequest,
        200: {
          type: "string",
          format: "binary",
        },
      },
    },
    async (request, reply) => {
      const { fileName, fileContent } = await buildDeliveriesFile(
        request.query,
      );
      return reply
        .header("Content-Disposition", `attachment; filename=${fileName}`)
        .type("text/csv")
        .send(fileContent);
    },
  );
}
