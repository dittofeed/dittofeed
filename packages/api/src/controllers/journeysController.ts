import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  getJourneyConstraintViolations,
  getJourneysStats,
  toJourneyResource,
  upsertJourney,
} from "backend-lib/src/journeys";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import {
  DeleteJourneyRequest,
  EmptyResponse,
  GetJourneysRequest,
  GetJourneysResponse,
  JourneyDefinition,
  JourneyDraft,
  JourneyStatsRequest,
  JourneyStatsResponse,
  JourneyUpsertValidationError,
  JourneyUpsertValidationErrorType,
  Prisma,
  SavedJourneyResource,
  UpsertJourneyResource,
} from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { validate as validateUuid } from "uuid";

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
      const journeyModels = await prisma().journey.findMany({
        where: {
          workspaceId: request.query.workspaceId,
        },
      });
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
      const { id } = request.body;

      try {
        await prisma().journey.delete({
          where: {
            id,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          switch (e.code) {
            case "P2025":
              return reply.status(404).send();
            case "P2023":
              return reply.status(404).send();
          }
        }
        throw e;
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
