import { Type, TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  deleteUserPropertyIndex,
  getUserPropertyIndices,
  upsertUserPropertyIndex,
} from "backend-lib/src/userPropertyIndices";
import { FastifyInstance } from "fastify";
import {
  DeleteUserPropertyIndexRequest,
  EmptyResponse,
  GetUserPropertyIndicesRequest,
  UpsertUserPropertyIndexRequest,
  UserPropertyIndexResource,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function userPropertyIndexController(
  fastify: FastifyInstance,
) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "List user property indices for a workspace.",
        querystring: GetUserPropertyIndicesRequest,
        tags: ["User Property Indices"],
        response: {
          200: Type.Array(UserPropertyIndexResource),
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.query;

      const indices = await getUserPropertyIndices({ workspaceId });

      const resources = indices.map((index) => ({
        id: index.id,
        workspaceId: index.workspaceId,
        userPropertyId: index.userPropertyId,
        type: index.type,
        createdAt: index.createdAt.getTime(),
        updatedAt: index.updatedAt.getTime(),
      }));

      return reply.status(200).send(resources);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description:
          "Create or update a user property index. If the type changes, old data will be pruned and new data will be backfilled.",
        tags: ["User Property Indices"],
        body: UpsertUserPropertyIndexRequest,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, userPropertyId, type } = request.body;

      await upsertUserPropertyIndex({
        workspaceId,
        userPropertyId,
        type,
      });

      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description:
          "Delete a user property index. This will remove the index configuration and prune all indexed data.",
        tags: ["User Property Indices"],
        body: DeleteUserPropertyIndexRequest,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, userPropertyId } = request.body;

      await deleteUserPropertyIndex({
        workspaceId,
        userPropertyId,
      });

      return reply.status(204).send();
    },
  );
}
