import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  getJourneyConstraintViolations,
  getJourneysStats,
  toJourneyResource,
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
      // FIXME create transaction
      // FIXME check that transition of status is valid
      // FIXME trigger re-entry if necessary
      // FIXME add workflow to trigger re-entry
      const {
        id,
        name,
        definition,
        workspaceId,
        status,
        canRunMultiple,
        draft,
      } = request.body;

      if (id && !validateUuid(id)) {
        return reply.status(400).send({
          message: "Invalid journey id",
          variant: {
            type: JourneyUpsertValidationErrorType.IdError,
            message: "Invalid journey id, must be a valid v4 UUID",
          },
        });
      }

      /*
      TODO validate that status transitions satisfy:
        NotStarted -> Running OR Running -> Paused
      But not:
        NotStarted -> Paused OR * -> NotStarted
      */
      if (definition) {
        const constraintViolations = getJourneyConstraintViolations({
          definition,
          newStatus: status,
        });
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

      // null out the draft when the definition is updated or when the draft is
      // explicitly set to null
      const nullableDraft =
        definition || draft === null ? Prisma.DbNull : draft;

      const where: Prisma.JourneyWhereUniqueInput = id
        ? { id }
        : { workspaceId_name: { workspaceId, name } };

      const journey = await prisma().journey.upsert({
        where,
        create: {
          id,
          workspaceId,
          name,
          definition,
          draft: nullableDraft,
          status,
          canRunMultiple,
        },
        update: {
          name,
          definition,
          draft: nullableDraft,
          status,
          canRunMultiple,
        },
      });

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
      const stats = await getJourneysStats({
        workspaceId: request.query.workspaceId,
        journeyIds: request.query.journeyIds,
      });
      return reply.status(200).send(stats);
    },
  );
}
