import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import prisma from "backend-lib/src/prisma";
import {
  Journey,
  JourneyDefinition,
  JourneyResource,
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
        body: UpsertJourneyResource,
        response: {
          200: JourneyResource,
        },
      },
    },
    async (request, reply) => {
      let journey: Journey;
      const { id, name, definition, workspaceId, status } = request.body;
      const canCreate = workspaceId && name && definition;

      /*
      TODO validate that status transitions satisfy:
        NotStarted -> Running OR Running -> Paused
      But not:
        NotStarted -> Paused OR * -> NotStarted
      */
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
            status,
          },
          update: {
            workspaceId,
            name,
            definition,
            status,
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
            status,
          },
        });
      }
      const journeyDefinitionResult = schemaValidate(
        journey.definition,
        JourneyDefinition
      );
      if (journeyDefinitionResult.isErr()) {
        // TODO add logging
        return reply.status(500).send();
      }
      const resource: JourneyResource = {
        id: journey.id,
        name: journey.name,
        workspaceId: journey.workspaceId,
        status: journey.status,
        definition: journeyDefinitionResult.value,
      };
      return reply.status(200).send(resource);
    }
  );
}
