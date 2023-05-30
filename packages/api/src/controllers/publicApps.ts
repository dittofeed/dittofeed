import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  submitBatch,
  submitIdentify,
  submitPage,
  submitScreen,
  submitTrack,
} from "backend-lib/src/apps";
import { validateWriteKey } from "backend-lib/src/auth";
import logger from "backend-lib/src/logger";
import { FastifyInstance } from "fastify";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import {
  BatchAppData,
  EmptyResponse,
  IdentifyData,
  PageData,
  ScreenData,
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
      const validWriteKey = await validateWriteKey({
        writeKey: request.headers.authorization,
      });

      if (!validWriteKey) {
        return reply.status(401).send();
      }

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
    async (request, reply) => {
      const validWriteKey = await validateWriteKey({
        writeKey: request.headers.authorization,
      });

      if (!validWriteKey) {
        return reply.status(401).send();
      }

      await submitTrack({
        workspaceId: request.headers[WORKSPACE_ID_HEADER],
        data: request.body,
      });
      return reply.status(204).send();
    }
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
    async (request, reply) => {
      const validWriteKey = await validateWriteKey({
        writeKey: request.headers.authorization,
      });

      if (!validWriteKey) {
        return reply.status(401).send();
      }

      await submitPage({
        workspaceId: request.headers[WORKSPACE_ID_HEADER],
        data: request.body,
      });
      return reply.status(204).send();
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/screen",
    {
      schema: {
        body: ScreenData,
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
      const validWriteKey = await validateWriteKey({
        writeKey: request.headers.authorization,
      });

      if (!validWriteKey) {
        return reply.status(401).send();
      }

      await submitScreen({
        workspaceId: request.headers[WORKSPACE_ID_HEADER],
        data: request.body,
      });
      return reply.status(204).send();
    }
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
      const validWriteKey = await validateWriteKey({
        writeKey: request.headers.authorization,
      });

      if (!validWriteKey) {
        return reply.status(401).send();
      }
      await submitBatch({
        workspaceId: request.headers[WORKSPACE_ID_HEADER],
        data: request.body,
      });
      return reply.status(204).send();
    }
  );
}
