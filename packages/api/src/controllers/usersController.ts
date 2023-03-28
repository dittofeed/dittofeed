import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import backendConfig from "backend-lib/src/config";
import { GetUsersRequest, GetUsersResponse } from "backend-lib/src/types";
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
        },
      },
    },
    async (request, reply) => {
      const { defaultWorkspaceId } = backendConfig();
      const { users, nextCursor } = await getUsers({
        workspaceId: defaultWorkspaceId,
        afterCursor: request.query.afterCursor,
      });
      return reply.status(200).send({
        users,
        nextCursor,
      });
    }
  );
}
