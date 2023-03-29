import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import backendConfig from "backend-lib/src/config";
import {
  BadRequestResponse,
  GetUsersRequest,
  GetUsersResponse,
} from "backend-lib/src/types";
import { getUsers } from "backend-lib/src/users";
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
      const { defaultWorkspaceId } = backendConfig();
      const result = await getUsers({
        workspaceId: defaultWorkspaceId,
        afterCursor: request.query.afterCursor,
      });
      if (result.isErr()) {
        return reply.status(400).send({
          message: result.error.message,
        });
      }
      const { users, nextCursor } = result.value;
      return reply.status(200).send({
        users,
        nextCursor,
      });
    }
  );
}
