import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { getEmailForViewInBrowser } from "backend-lib/src/viewInBrowser";
import { FastifyInstance } from "fastify";
import { ViewInBrowserRequest } from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function viewInBrowserController(
  fastify: FastifyInstance,
) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "View email in browser",
        querystring: ViewInBrowserRequest,
        response: {
          200: Type.String(),
          400: Type.Object({
            message: Type.String(),
          }),
          401: Type.Object({
            message: Type.String(),
          }),
          404: Type.Object({
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { w: workspaceId, m: messageId, h: hash } = request.query;

      const result = await getEmailForViewInBrowser({
        workspaceId,
        messageId,
        hash,
      });

      if (result.isErr()) {
        switch (result.error) {
          case "InvalidHash":
            return reply.status(401).send({
              message: "Unauthorized",
            });
          case "EmailNotFound":
            return reply.status(404).send({
              message: "Email not found",
            });
          case "BlobStorageDisabled":
            return reply.status(400).send({
              message: "Feature not available",
            });
        }
      }

      return reply.type("text/html").send(result.value);
    },
  );
}
