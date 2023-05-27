import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { submitIdentify } from "backend-lib/src/apps";
import logger from "backend-lib/src/logger";
import { FastifyInstance } from "fastify";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import {
  BatchAppData,
  EmptyResponse,
  IdentifyData,
  PageData,
  TrackData,
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
      schema: {
        body: TrackData,
        headers: Type.Object({
          [WORKSPACE_ID_HEADER]: WorkspaceId,
          authorization: Type.String(),
        }),
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {}
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/page",
    {
      schema: {
        body: PageData,
        headers: Type.Object({
          [WORKSPACE_ID_HEADER]: WorkspaceId,
          authorization: Type.String(),
        }),
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {}
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/group",
    {
      schema: {},
    },
    async (request, reply) => {
      logger().warn("Client is calling unimplemented endpoint /group");

      return reply.status(400).send({
        message: "Not yet implemented.",
      });
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/alias",
    {
      schema: {},
    },
    async (request, reply) => {
      logger().warn("Client is calling unimplemented endpoint /alias");

      return reply.status(400).send({
        message: "Not yet implemented.",
      });
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/batch",
    {
      schema: {
        body: BatchAppData,
      },
    },
    async (request, reply) => {}
  );
}
