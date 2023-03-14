import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import prisma, { Prisma } from "backend-lib/src/prisma";
import { Segment } from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  SegmentDefinition,
  SegmentResource,
  UpsertSegmentResource,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function segmentsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Create or update a user segment.",

        body: UpsertSegmentResource,
        response: {
          200: SegmentResource,
        },
      },
    },
    async (request, reply) => {
      let segment: Segment;
      const { id, name, definition, workspaceId } = request.body;

      const canCreate = workspaceId && name && definition;

      if (canCreate && id) {
        segment = await prisma().segment.upsert({
          where: {
            id,
          },
          create: {
            id,
            workspaceId,
            name,
            definition,
          },
          update: {
            workspaceId,
            name,
            definition,
          },
        });
      } else {
        segment = await prisma().segment.update({
          where: {
            id,
          },
          data: {
            workspaceId,
            name,
            definition,
          },
        });
      }

      const segmentDefinitionResult = schemaValidate(
        segment.definition,
        SegmentDefinition
      );

      if (segmentDefinitionResult.isErr()) {
        // TODO add logging
        return reply.status(500).send();
      }
      const resource: SegmentResource = {
        id: segment.id,
        name: segment.name,
        workspaceId: segment.workspaceId,
        definition: segmentDefinitionResult.value,
      };

      return reply.status(200).send(resource);
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description: "Delete a segment.",
        body: Type.Object({
          id: Type.String(),
        }),
        response: {
          204: {},
          404: {},
        },
      },
    },
    async (request, reply) => {
      const { id } = request.body;

      try {
        await prisma().segment.delete({
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
    }
  );
}
