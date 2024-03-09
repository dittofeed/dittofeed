import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  getJourneyConstraintViolations,
  getJourneysStats,
} from "backend-lib/src/journeys";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import {
  DeleteJourneyRequest,
  EmptyResponse,
  Journey,
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
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function journeysController(fastify: FastifyInstance) {
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
      let journey: Journey;
      const {
        id,
        name,
        definition,
        workspaceId,
        status,
        canRunMultiple,
        draft,
      } = request.body;

      /*
      TODO validate that status transitions satisfy:
        NotStarted -> Running OR Running -> Paused
      But not:
        NotStarted -> Paused OR * -> NotStarted
      */
      if (definition) {
        const constraintViolations = getJourneyConstraintViolations(definition);
        if (constraintViolations.length > 0) {
          return reply.status(400).send({
            message: "Journey definition violates constraints",
            variant: {
              type: JourneyUpsertValidationErrorType.ConstraintViolation,
              violations: constraintViolations,
            },
          });
        }
      }

      const canCreate = workspaceId && name;
      if (canCreate) {
        journey = await prisma().journey.upsert({
          where: {
            id,
          },
          create: {
            id,
            workspaceId,
            name,
            definition,
            draft: definition ? Prisma.DbNull : draft,
            status,
            canRunMultiple,
          },
          update: {
            workspaceId,
            name,
            definition,
            draft: definition ? Prisma.DbNull : draft,
            status,
            canRunMultiple,
          },
        });
      } else {
        journey = await prisma().journey.update({
          where: {
            id,
          },
          data: {
            workspaceId,
            name,
            definition,
            draft: definition ? Prisma.DbNull : draft,
            status,
            canRunMultiple,
          },
        });
      }
      const journeyDefinitionResult = journey.definition
        ? schemaValidate(journey.definition, JourneyDefinition)
        : undefined;

      // type checker seems not to understand with optional chain
      // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
      if (journeyDefinitionResult && journeyDefinitionResult.isErr()) {
        logger().error(
          {
            errors: journeyDefinitionResult.error,
          },
          "Failed to validate journey definition",
        );
        return reply.status(500).send();
      }

      const journeyDraftResult = journey.draft
        ? schemaValidate(journey.draft, JourneyDraft)
        : undefined;

      // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
      if (journeyDraftResult && journeyDraftResult.isErr()) {
        logger().error(
          {
            errors: journeyDraftResult.error,
          },
          "Failed to validate journey draft",
        );
        return reply.status(500).send();
      }

      const journeyStatus = journey.status;
      const journeyDefinition = journeyDefinitionResult?.value;
      if (journeyStatus !== "NotStarted" && !journeyDefinition) {
        throw new Error(
          "Journey status is not NotStarted but has no definition",
        );
      }
      const baseResource = {
        id: journey.id,
        name: journey.name,
        workspaceId: journey.workspaceId,
        draft: journeyDraftResult?.value,
        updatedAt: Number(journey.updatedAt),
        createdAt: Number(journey.createdAt),
      } as const;

      let resource: SavedJourneyResource;
      if (journeyStatus === "NotStarted") {
        resource = {
          ...baseResource,
          status: journeyStatus,
          definition: journeyDefinition,
        };
      } else {
        if (!journeyDefinition) {
          const err = new Error(
            "Journey status is not NotStarted but has no definition",
          );
          logger().error({
            journeyId: journey.id,
            err,
          });
          return reply.status(500).send();
        }
        resource = {
          ...baseResource,
          status: journeyStatus,
          definition: journeyDefinition,
        };
      }

      return reply.status(200).send(resource);
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
      let journeyIds: string[];
      if (request.query.journeyIds) {
        journeyIds = request.query.journeyIds;
      } else {
        journeyIds = (
          await prisma().journey.findMany({
            where: {
              workspaceId: request.query.workspaceId,
            },
            select: {
              id: true,
            },
          })
        ).map((journey) => journey.id);
      }
      const stats = await getJourneysStats({
        workspaceId: request.query.workspaceId,
        journeyIds,
      });
      return reply.status(200).send(stats);
    },
  );
}
