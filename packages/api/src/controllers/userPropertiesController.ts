import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  deleteUserProperty,
  findAllUserPropertyResources,
  updateUserPropertyStatus,
  upsertUserProperty,
} from "backend-lib/src/userProperties";
import { FastifyInstance } from "fastify";
import {
  DeleteUserPropertyRequest,
  EmptyResponse,
  ReadAllUserPropertiesRequest,
  ReadAllUserPropertiesResponse,
  SavedUserPropertyResource,
  UpdateUserPropertyStatusError,
  UpdateUserPropertyStatusRequest,
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
      const { workspaceId, id }: DeleteUserPropertyRequest = request.body;

      const deleted = await deleteUserProperty({ workspaceId, id });
      if (!deleted) {
        return reply.status(404).send();
      }

      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().patch(
    "/status",
    {
      schema: {
        description: "Update user property status.",
        tags: ["User Properties"],
        body: UpdateUserPropertyStatusRequest,
        response: {
          200: SavedUserPropertyResource,
          400: UpdateUserPropertyStatusError,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, id, status }: UpdateUserPropertyStatusRequest =
        request.body;

      const result = await updateUserPropertyStatus({
        workspaceId,
        id,
        status,
      });

      if (result.isErr()) {
        return reply.status(400).send(result.error);
      }

      return reply.status(200).send(result.value);
    },
  );
}
