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
import {
  BaseMessageResponse,
  BatchAppData,
  EmptyResponse,
  IdentifyData,
  PageData,
  ScreenData,
  TrackData,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function publicAppsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/identify",
    {
      schema: {
        description:
          "The Identify call lets you tie a user to their actions and record traits about them. It includes a unique User ID and any optional traits you know about the user, like their email, name, and more.",
        tags: ["Public Apps"],
        body: IdentifyData,
        headers: Type.Object({
          authorization: Type.String(),
        }),
        response: {
          204: EmptyResponse,
          401: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const workspaceIdFromWriteKey = await validateWriteKey({
        writeKey: request.headers.authorization,
      });

      if (!workspaceIdFromWriteKey) {
        return reply.status(401).send({
          message: "Invalid write key.",
        });
      }

      await submitIdentify({
        workspaceId: workspaceIdFromWriteKey,
        data: request.body,
      });
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/track",
    {
      schema: {
        description:
          "The Track call is how you record any actions your users perform, along with any properties that describe the action.",
        tags: ["Public Apps"],
        body: TrackData,
        headers: Type.Object({
          authorization: Type.String(),
        }),
        response: {
          204: EmptyResponse,
          401: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const workspaceIdFromWriteKey = await validateWriteKey({
        writeKey: request.headers.authorization,
      });

      if (!workspaceIdFromWriteKey) {
        return reply.status(401).send({
          message: "Invalid write key.",
        });
      }

      await submitTrack({
        workspaceId: workspaceIdFromWriteKey,
        data: request.body,
      });
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/page",
    {
      schema: {
        description:
          "The page call lets you record whenever a user sees a page of your website, along with any optional properties about the page.",
        tags: ["Public Apps"],
        body: PageData,
        headers: Type.Object({
          authorization: Type.String(),
        }),
        response: {
          204: EmptyResponse,
          401: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const workspaceIdFromWriteKey = await validateWriteKey({
        writeKey: request.headers.authorization,
      });

      if (!workspaceIdFromWriteKey) {
        return reply.status(401).send({
          message: "Invalid write key.",
        });
      }

      await submitPage({
        workspaceId: workspaceIdFromWriteKey,
        data: request.body,
      });
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/screen",
    {
      schema: {
        description:
          "The screen call lets you record whenever a user sees a screen, the mobile equivalent of page, in your mobile app, along with any properties about the screen",
        tags: ["Public Apps"],
        body: ScreenData,
        headers: Type.Object({
          authorization: Type.String(),
        }),
        response: {
          204: EmptyResponse,
          401: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const workspaceIdFromWriteKey = await validateWriteKey({
        writeKey: request.headers.authorization,
      });

      if (!workspaceIdFromWriteKey) {
        return reply.status(401).send({
          message: "Invalid write key.",
        });
      }

      await submitScreen({
        workspaceId: workspaceIdFromWriteKey,
        data: request.body,
      });
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/group",
    {
      schema: {
        tags: ["Public Apps"],
      },
    },
    async (request, reply) => {
      logger().warn("Client is calling unimplemented endpoint /group");

      return reply.status(400).send({
        message: "Not yet implemented.",
      });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/alias",
    {
      schema: {
        tags: ["Public Apps"],
      },
    },
    async (request, reply) => {
      logger().warn("Client is calling unimplemented endpoint /alias");

      return reply.status(400).send({
        message: "Not yet implemented.",
      });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/batch",
    {
      schema: {
        description:
          "The batch method lets you send a series of identify, group, track, page and screen requests in a single batch, saving on outbound requests.",
        tags: ["Public Apps"],
        body: BatchAppData,
        headers: Type.Object({
          authorization: Type.String(),
        }),
        response: {
          204: EmptyResponse,
          401: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const workspaceIdFromWriteKey = await validateWriteKey({
        writeKey: request.headers.authorization,
      });

      if (!workspaceIdFromWriteKey) {
        return reply.status(401).send({
          message: "Invalid write key.",
        });
      }
      await submitBatch({
        workspaceId: workspaceIdFromWriteKey,
        data: request.body,
      });
      return reply.status(204).send();
    },
  );
}
