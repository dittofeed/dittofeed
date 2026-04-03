import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { getUserSubscriptions } from "backend-lib/src/subscriptionGroups";
import { getUserIdentityAliasesForProfile } from "backend-lib/src/identityLinks";
import {
  BadRequestResponse,
  DeleteUsersRequest,
  EmptyResponse,
  GetUserIdentityAliasesRequest,
  GetUserIdentityAliasesResponse,
  GetUsersCountResponse,
  GetUsersRequest,
  GetUsersResponse,
  GetUserSubscriptionsRequest,
  GetUserSubscriptionsResponse,
} from "backend-lib/src/types";
import { deleteUsers, getUsers, getUsersCount } from "backend-lib/src/users";
import { FastifyInstance } from "fastify";
import { RoleEnum } from "isomorphic-lib/src/types";

import { denyUnlessAtLeastRole } from "../buildApp/workspaceRoleGuard";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function usersController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/",
    {
      schema: {
        description: "Get list of users",
        tags: ["Users"],
        body: GetUsersRequest,
        response: {
          200: GetUsersResponse,
          400: BadRequestResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await getUsers(request.body);
      if (result.isErr()) {
        return reply.status(400).send({
          message: result.error.message,
        });
      }
      const { users, nextCursor, previousCursor, userCount } = result.value;
      return reply.status(200).send({
        users,
        nextCursor,
        previousCursor,
        userCount,
      });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/count",
    {
      schema: {
        description: "Get count of users",
        tags: ["Users"],
        body: GetUsersRequest,
        response: {
          200: GetUsersCountResponse,
          400: BadRequestResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await getUsersCount(request.body);
      if (result.isErr()) {
        return reply.status(400).send({
          message: result.error.message,
        });
      }
      return reply.status(200).send(result.value);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/identity-aliases",
    {
      schema: {
        description:
          "Linked anonymous ids for a known profile, or canonical user id when the profile is a linked anonymous id.",
        tags: ["Users"],
        querystring: GetUserIdentityAliasesRequest,
        response: {
          200: GetUserIdentityAliasesResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, profileUserId } = request.query;
      const { linkedAnonymousIds, canonicalUserId } =
        await getUserIdentityAliasesForProfile(workspaceId, profileUserId);
      return reply.status(200).send({
        workspaceId,
        profileUserId,
        linkedAnonymousIds,
        canonicalUserId,
      });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/subscriptions",
    {
      schema: {
        description: "Get subscriptions for a user",
        tags: ["Users"],
        querystring: GetUserSubscriptionsRequest,
        response: {
          200: GetUserSubscriptionsResponse,
        },
      },
    },

    async (request, reply) => {
      const result = await getUserSubscriptions({
        workspaceId: request.query.workspaceId,
        userId: request.query.userId,
      });
      return reply.status(200).send({
        workspaceId: request.query.workspaceId,
        userId: request.query.userId,
        subscriptionGroups: result,
      });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description:
          "Delete events, and computed properties and segments for specific users.",
        tags: ["Users"],
        body: DeleteUsersRequest,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      if (denyUnlessAtLeastRole(request, reply, RoleEnum.Author)) {
        return;
      }
      await deleteUsers(request.body);
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/v2",
    {
      schema: {
        description:
          "Delete events, and computed properties and segments for specific users.",
        tags: ["Users"],
        querystring: DeleteUsersRequest,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      if (denyUnlessAtLeastRole(request, reply, RoleEnum.Author)) {
        return;
      }
      await deleteUsers(request.query);
      return reply.status(204).send();
    },
  );
}
