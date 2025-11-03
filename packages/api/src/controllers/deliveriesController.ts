import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  buildDeliveriesFile,
  searchDeliveries,
  searchDeliveriesCount,
} from "backend-lib/src/deliveries";
import logger from "backend-lib/src/logger";
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
      const controller = new AbortController();
      request.raw.on("close", () => {
        if (request.raw.destroyed) {
          logger().info(
            {
              workspaceId: request.query.workspaceId,
            },
            "delivery search aborted",
          );
          controller.abort();
        }
      });

      const deliveries = await searchDeliveries({
        ...request.query,
        abortSignal: controller.signal,
      });
      return reply.status(200).send(deliveries);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/count",
    {
      schema: {
        description: "Fetch count of deliveries for the given filters.",
        tags: ["Deliveries"],
        querystring: SearchDeliveriesRequest,
        response: {
          200: Type.Object({
            count: Type.Number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const controller = new AbortController();
      request.raw.on("close", () => {
        if (request.raw.destroyed) {
          logger().info(
            {
              workspaceId: request.query.workspaceId,
            },
            "delivery count search aborted",
          );
          controller.abort();
        }
      });

      const count = await searchDeliveriesCount({
        ...request.query,
        abortSignal: controller.signal,
      });

      return reply.status(200).send({ count });
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
