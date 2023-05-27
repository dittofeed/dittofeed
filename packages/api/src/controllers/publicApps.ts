import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { submitIdentify } from "backend-lib/src/apps";
import { FastifyInstance } from "fastify";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import {
  EmptyResponse,
  IdentifyData,
  WorkspaceId,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function publicAppsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/identify",
    {
      schema: {
        body: IdentifyData,
        headers: Type.Object({
          [WORKSPACE_ID_HEADER]: WorkspaceId,
          authorization: Type.String(),
        }),
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      await submitIdentify({
        workspaceId: request.headers[WORKSPACE_ID_HEADER],
        data: request.body,
      });
      return reply.status(204).send();
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/track",
    {
      schema: {},
    },
    async (request, reply) => {}
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/page",
    {
      schema: {},
    },
    async (request, reply) => {}
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/group",
    {
      schema: {},
    },
    async (request, reply) => {}
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/alias",
    {
      schema: {},
    },
    async (request, reply) => {}
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/batch",
    {
      schema: {},
    },
    async (request, reply) => {}
  );
}
