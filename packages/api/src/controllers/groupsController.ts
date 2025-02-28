import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { getGroupsForUser, getUsersForGroup } from "backend-lib/src/groups";
import { FastifyInstance } from "fastify";
import {
  BadRequestResponse,
  GetGroupsForUserRequest,
  GetGroupsForUserResponse,
  GetUsersForGroupRequest,
  GetUsersForGroupResponse,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function groupsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/users",
    {
      schema: {
        description: "Get list of users for a specific group",
        tags: ["Groups"],
        querystring: GetUsersForGroupRequest,
        response: {
          200: GetUsersForGroupResponse,
          400: BadRequestResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, groupId, limit, offset } = request.query;
      const userIds = await getUsersForGroup({
        workspaceId,
        groupId,
        limit,
        offset,
      });

      return reply.status(200).send({
        users: userIds,
      });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/user-groups",
    {
      schema: {
        description: "Get list of groups for a specific user",
        tags: ["Groups"],
        querystring: GetGroupsForUserRequest,
        response: {
          200: GetGroupsForUserResponse,
          400: BadRequestResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, userId, limit, offset } = request.query;
      const groupIds = await getGroupsForUser({
        workspaceId,
        userId,
        limit,
        offset,
      });

      return reply.status(200).send({
        groups: groupIds,
      });
    },
  );
}
