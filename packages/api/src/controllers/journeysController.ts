import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import {
  getJourneysStats,
  toJourneyResource,
  upsertJourney,
} from "backend-lib/src/journeys";
import {
  DeleteJourneyRequest,
  EmptyResponse,
  GetJourneysRequest,
  GetJourneysResponse,
  JourneyStatsRequest,
  JourneyStatsResponse,
  JourneyUpsertValidationError,
  SavedJourneyResource,
  UpsertJourneyResource,
} from "backend-lib/src/types";
import { and, eq } from "drizzle-orm";
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
      const journeyModels = await db()
        .select()
        .from(schema.journey)
        .where(eq(schema.journey.workspaceId, request.query.workspaceId));
      const journeys = journeyModels.map((j) => unwrap(toJourneyResource(j)));
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
      const { id, workspaceId } = request.body;

      const result = await db()
        .delete(schema.journey)
        .where(
          and(
            eq(schema.journey.id, id),
            eq(schema.journey.workspaceId, workspaceId),
          ),
        )
        .returning();

      if (result.length === 0) {
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
