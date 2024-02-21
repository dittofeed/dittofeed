import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { AdminApiKeyDefinition } from "isomorphic-lib/src/types";

import { getWorkspaceId } from "../workspace";

// eslint-disable-next-line @typescript-eslint/require-await
const adminAuth = fp(async (fastify: FastifyInstance) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const workspaceId = await getWorkspaceId(request);
    if (!workspaceId) {
      return reply.status(401).send();
    }
    const apiKeys = await prisma().adminApiKey.findMany({
      where: {
        workspaceId,
      },
      include: {
        secret: true,
      },
    });
    const actualKey = request.headers.authorization?.trim().split(" ")[1];
    if (!actualKey) {
      return reply.status(401).send();
    }
    let matchingKey = false;
    for (const apiKey of apiKeys) {
      const definitionResult = schemaValidate(
        apiKey.secret.configValue,
        AdminApiKeyDefinition,
      );
      if (definitionResult.isErr()) {
        logger().error(
          {
            workspaceId,
            apiKeyId: apiKey.id,
          },
          "Invalid admin API key definition",
        );
        continue;
      }
      if (definitionResult.value.key) {
        if (definitionResult.value.key === actualKey) {
          matchingKey = true;
          break;
        }
      }
    }
    if (!matchingKey) {
      return reply.status(401).send();
    }
  });
});

export default adminAuth;
