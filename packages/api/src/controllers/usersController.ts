import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  BadRequestResponse,
  DeleteUsersRequest,
  EmptyResponse,
  GetUsersRequest,
  GetUsersResponse,
} from "backend-lib/src/types";
import { deleteUsers, getUsers } from "backend-lib/src/users";
import { FastifyInstance } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function usersController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Get list of users",
        querystring: GetUsersRequest,
        response: {
          200: GetUsersResponse,
          400: BadRequestResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await getUsers({
        workspaceId: request.query.workspaceId,
        cursor: request.query.cursor,
        direction: request.query.direction,
        segmentId: request.query.segmentId,
      });
      if (result.isErr()) {
        return reply.status(400).send({
          message: result.error.message,
        });
      }
      const { users, nextCursor, previousCursor } = result.value;
      return reply.status(200).send({
        users,
        nextCursor,
        previousCursor,
      });
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description:
          "Delete events, and computed properties and segments for specific users.",
        body: DeleteUsersRequest,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      await deleteUsers(request.body);
      return reply.status(204).send();
    }
  );
}
