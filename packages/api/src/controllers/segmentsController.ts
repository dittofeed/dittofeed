import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import prisma, { Prisma } from "backend-lib/src/prisma";
import { buildSegmentsFile, upsertSegment } from "backend-lib/src/segments";
import { FastifyInstance } from "fastify";
import {
  DeleteSegmentRequest,
  EmptyResponse,
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
        tags: ["Segments"],
        body: UpsertSegmentResource,
        response: {
          200: SegmentResource,
        },
      },
    },
    async (request, reply) => {
      const resource = await upsertSegment(request.body);
      return reply.status(200).send(resource);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description: "Delete a segment.",
        tags: ["Segments"],
        body: DeleteSegmentRequest,
        response: {
          204: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.body;

      try {
        await prisma().segmentAssignment.deleteMany({
          where: {
            segmentId: id,
          },
        });
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
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/download",
    {
      schema: {
        description: "Download a csv containing segment assignments.",
        tags: ["Segments"],
        querystring: Type.Object({
          workspaceId: Type.String(),
        }),
        200: {
          type: "string",
          format: "binary",
        },
      },
    },

    async (request, reply) => {
      const { fileName, fileContent } = await buildSegmentsFile({
        workspaceId: request.query.workspaceId,
      });
      return reply
        .header("Content-Disposition", `attachment; filename=${fileName}`)
        .type("text/csv")
        .send(fileContent);
    },
  );
}
