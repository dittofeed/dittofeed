import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  submitBatchkWithTriggers,
  submitIdentify,
  submitPage,
  submitScreen,
  submitTrackWithTriggers,
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
export default async function apiKeyController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/",
    {
      schema: {
        description: "Create an admin API key.",
        tags: ["API Key", "Admin"],
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
      return reply.status(204).send();
    },
  );

}
