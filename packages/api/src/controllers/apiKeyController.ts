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
import prisma, { Prisma } from "backend-lib/src/prisma";
import { randomBytes } from "crypto";
import { FastifyInstance } from "fastify";
import {
  BaseMessageResponse,
  BatchAppData,
  CreateAdminApiKeyRequest,
  CreateAdminApiKeyResponse,
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
        body: CreateAdminApiKeyRequest,
        response: {
          200: CreateAdminApiKeyResponse,
          409: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const key = randomBytes(32).toString("hex");
      let isConflictError = false;

      try {
        await prisma().$transaction(async (tx) => {
          try {
            const secret = await tx.secret.create({
              data: {
                workspaceId: request.body.workspaceId,
                name: `df-admin-api-key-${request.body.name}`,
                value: key,
              },
            });
            await tx.adminApiKey.create({
              data: {
                name: request.body.name,
                workspaceId: request.body.workspaceId,
                secretId: secret.id,
              },
            });
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            ) {
              isConflictError = true;
            }
            throw error;
          }
        });
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (isConflictError) {
          return reply.status(409).send();
        }
      }

      return reply.status(200).send({
        apiKey: key,
      });
    },
  );
}
