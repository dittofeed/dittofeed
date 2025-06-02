import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { FastifyInstance } from "fastify";
import { OAUTH_COOKIE_NAME } from "isomorphic-lib/src/constants";
import { EmptyResponse, SetCsrfCookieRequest } from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function oauthController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/set-csrf-cookie",
    {
      schema: {
        description: "Sets the CSRF cookie for OAuth flows.",
        tags: ["OAuth"],
        body: SetCsrfCookieRequest,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { csrfToken, expiresAt } = request.body;

      const cookieOptions = {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        expires: new Date(expiresAt),
      };

      await reply.setCookie(OAUTH_COOKIE_NAME, csrfToken, cookieOptions);
      return reply.status(204).send();
    },
  );
}
