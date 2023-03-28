import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { GetUsersResponse } from "backend-lib/src/types";
import { FastifyInstance } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function usersController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Get list of users",
        querystring: GetUsersResponse,
        response: {
          200: GetUsersResponse,
        },
      },
    },
    async (_request, _reply) => {}
  );
}
