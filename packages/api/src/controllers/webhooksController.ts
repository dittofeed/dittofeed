import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import backendConfig from "backend-lib/src/config";
import prisma from "backend-lib/src/prisma";
import { insertUserEvents } from "backend-lib/src/userEvents";
import { FastifyInstance } from "fastify";

import { generateDigest } from "../crypto";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function webhookController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/segment",
    {
      schema: {
        description:
          "Used to consume segment.io webhook payloads. Must be exposed publicly to the internet.",
        body: Type.Object(
          {
            messageId: Type.String(),
            timestamp: Type.String(),
          },
          { additionalProperties: true }
        ),
        headers: Type.Object({
          "x-signature": Type.String(),
          "df-workspace-id": Type.Optional(
            Type.String({
              description:
                "Id of the workspace which will receive the segment payload. Defaults to the default workspace id, for single tenant systems",
            })
          ),
        }),
      },
    },
    async (request, reply) => {
      const { defaultWorkspaceId } = backendConfig();
      const workspaceId =
        request.headers["df-workspace-id"] ?? defaultWorkspaceId;
      const config = await prisma().segmentIOConfiguration.findUnique({
        where: { workspaceId },
      });

      if (!config) {
        return reply.status(503).send();
      }

      if (!request.rawBody || typeof request.rawBody !== "string") {
        // Should always be defined
        return reply.status(500).send();
      }

      const { sharedSecret } = config;
      const signature = request.headers["x-signature"];

      const digest = generateDigest({
        rawBody: request.rawBody,
        sharedSecret,
      });

      if (signature !== digest) {
        return reply.status(401).send();
      }

      await insertUserEvents({
        workspaceId,
        userEvents: [
          {
            messageId: request.body.messageId,
            messageRaw: request.rawBody,
          },
        ],
      });

      return reply.status(200).send();
    }
  );
}
