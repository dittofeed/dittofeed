import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import prisma, { Prisma } from "backend-lib/src/prisma";
import {
  findAllUserPropertyResources,
  upsertUserProperty,
} from "backend-lib/src/userProperties";
import { FastifyInstance } from "fastify";
import protectedUserProperties from "isomorphic-lib/src/protectedUserProperties";
import {
  DeleteUserPropertyRequest,
  EmptyResponse,
  ReadAllUserPropertiesRequest,
  ReadAllUserPropertiesResponse,
  SavedUserPropertyResource,
  UpsertUserPropertyError,
  UpsertUserPropertyResource,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function userPropertiesController(
  fastify: FastifyInstance,
) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Create or update a user property.",
        tags: ["User Properties"],
        body: UpsertUserPropertyResource,
        response: {
          200: SavedUserPropertyResource,
          400: UpsertUserPropertyError,
        },
      },
    },
    async (request, reply) => {
      const result = await upsertUserProperty(request.body);
      if (result.isErr()) {
        return reply.status(400).send(result.error);
      }
      const resource = result.value;

      return reply.status(200).send(resource);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Get all user properties.",
        tags: ["User Properties"],
        querystring: ReadAllUserPropertiesRequest,
        response: {
          200: ReadAllUserPropertiesResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId }: ReadAllUserPropertiesRequest = request.query;
      const userProperties = await findAllUserPropertyResources({
        workspaceId,
      });

      return reply.status(200).send({
        userProperties,
      });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description: "Delete a user property.",
        tags: ["User Properties"],
        body: DeleteUserPropertyRequest,
        response: {
          204: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { id }: DeleteUserPropertyRequest = request.body;

      let deletedCount: number;
      try {
        await prisma().userPropertyAssignment.deleteMany({
          where: {
            AND: [
              {
                userPropertyId: id,
              },
              {
                userProperty: {
                  name: {
                    notIn: Array.from(protectedUserProperties),
                  },
                },
              },
            ],
          },
        });
        const response = await prisma().userProperty.deleteMany({
          where: {
            AND: [
              {
                id,
              },
              {
                name: {
                  notIn: Array.from(protectedUserProperties),
                },
              },
            ],
          },
        });
        deletedCount = response.count;
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

      if (deletedCount <= 0) {
        return reply.status(404).send();
      }

      return reply.status(204).send();
    },
  );
}
