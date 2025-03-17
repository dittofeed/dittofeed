import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { getUserSubscriptions } from "backend-lib/src/subscriptionGroups";
import {
  BadRequestResponse,
  DeleteUsersRequest,
  EmptyResponse,
  GetUsersCountResponse,
  GetUsersRequest,
  GetUsersResponse,
  GetUserSubscriptionsRequest,
  GetUserSubscriptionsResponse,
} from "backend-lib/src/types";
import { deleteUsers, getUsers, getUsersCount } from "backend-lib/src/users";
import { FastifyInstance } from "fastify";

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
    "/subscriptions",
    {
      schema: {
        description: "Get subscriptions for a user",
        tags: ["Users"],
        params: GetUserSubscriptionsRequest,
        response: {
          200: GetUserSubscriptionsResponse,
        },
      },
    },

    async (request, reply) => {
      const result = await getUserSubscriptions({
        workspaceId: request.params.workspaceId,
        userId: request.params.userId,
      });
      return reply.status(200).send({
        workspaceId: request.params.workspaceId,
        userId: request.params.userId,
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
      await deleteUsers(request.body);
      return reply.status(204).send();
    },
  );
}
