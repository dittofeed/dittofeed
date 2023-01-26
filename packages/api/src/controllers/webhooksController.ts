import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import prisma from "backend-lib/src/prisma";
import { writeUserEvents } from "backend-lib/src/userEvents";
import * as crypto from "crypto";
import { FastifyInstance } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function webhookController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/segment",
    {
      schema: {
        description: "Used to consume segment.io webhooks.",
        body: Type.Object(
          {
            messageId: Type.String(),
            timestamp: Type.String(),
          },
          { additionalProperties: true }
        ),
        headers: Type.Object({
          "x-signature": Type.String(),
          "df-workspace-id": Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const workspaceId = request.headers["df-workspace-id"];
      const config = await prisma.segmentIOConfiguration.findUnique({
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

      const digest = crypto
        .createHmac("sha1", sharedSecret)
        .update(Buffer.from(request.rawBody, "utf-8"))
        .digest("hex");

      if (signature !== digest) {
        return reply.status(401).send();
      }

      await writeUserEvents([
        {
          messageId: request.body.messageId,
          workspaceId,
          messageRaw: request.rawBody,
        },
      ]);

      return reply.status(200).send();
    }
  );
}
