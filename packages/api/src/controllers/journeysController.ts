import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import {
  deleteJourney,
  getJourneysStats,
  toJourneyResource,
  upsertJourney,
} from "backend-lib/src/journeys";
import {
  DeleteJourneyRequest,
  EmptyResponse,
  GetJourneysRequest,
  GetJourneysResponse,
  GetJourneysResponseItem,
  JourneyStatsRequest,
  JourneyStatsResponse,
  JourneyUpsertValidationError,
  SavedJourneyResource,
  UpsertJourneyResource,
} from "backend-lib/src/types";
import { and, eq, inArray } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function journeysController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Get all journeys.",
        tags: ["Journeys"],
        querystring: GetJourneysRequest,
        response: {
          200: GetJourneysResponse,
        },
      },
    },
    async (request, reply) => {
      let journeys: GetJourneysResponseItem[] = [];
      const conditions = [
        eq(schema.journey.workspaceId, request.query.workspaceId),
      ];
      if (request.query.ids) {
        conditions.push(inArray(schema.journey.id, request.query.ids));
      }
      if (request.query.resourceType) {
        conditions.push(
          eq(schema.journey.resourceType, request.query.resourceType),
        );
      }

      if (request.query.getPartial) {
        const journeyModels = await db()
          .select({
            id: schema.journey.id,
            name: schema.journey.name,
            status: schema.journey.status,
            updatedAt: schema.journey.updatedAt,
            createdAt: schema.journey.createdAt,
            resourceType: schema.journey.resourceType,
            statusUpdatedAt: schema.journey.statusUpdatedAt,
            canRunMultiple: schema.journey.canRunMultiple,
          })
          .from(schema.journey)
          .where(and(...conditions));

        journeys = journeyModels.flatMap((j) => {
          return [
            {
              workspaceId: request.query.workspaceId,
              id: j.id,
              name: j.name,
              status: j.status,
              updatedAt: j.updatedAt.getTime(),
              createdAt: j.createdAt.getTime(),
            },
          ];
        });
      } else {
        const journeyModels = await db()
          .select()
          .from(schema.journey)
          .where(and(...conditions));

        journeys = journeyModels.map((j) => unwrap(toJourneyResource(j)));
      }
      return reply.status(200).send({ journeys });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Create or update a journey.",
        tags: ["Journeys"],
        body: UpsertJourneyResource,
        response: {
          200: SavedJourneyResource,
          400: JourneyUpsertValidationError,
        },
      },
    },
    async (request, reply) => {
      const result = await upsertJourney(request.body);
      if (result.isErr()) {
        return reply.status(400).send(result.error);
      }
      return reply.status(200).send(result.value);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description: "Delete a journey.",
        tags: ["Journeys"],
        body: DeleteJourneyRequest,
        response: {
          204: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await deleteJourney(request.body);
      if (!result) {
        return reply.status(404).send();
      }

      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/v2",
    {
      schema: {
        description: "Delete a journey.",
        tags: ["Journeys"],
        querystring: DeleteJourneyRequest,
        response: {
          204: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await deleteJourney(request.query);
      if (!result) {
        return reply.status(404).send();
      }

      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/stats",
    {
      schema: {
        description:
          "Retrieve stats regarding one or more journey's performance.",
        tags: ["Journeys"],
        querystring: JourneyStatsRequest,
        response: {
          200: JourneyStatsResponse,
        },
      },
    },
    async (request, reply) => {
      const stats = await getJourneysStats({
        workspaceId: request.query.workspaceId,
        journeyIds: request.query.journeyIds,
      });
      return reply.status(200).send(stats);
    },
  );
}
