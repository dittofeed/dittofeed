import logger from "backend-lib/src/logger";
import prisma, { Prisma } from "backend-lib/src/prisma";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import {
  jsonParseSafe,
  schemaValidate,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { AdminApiKeyDefinition } from "isomorphic-lib/src/types";

import { getWorkspaceId } from "../workspace";

export async function authenticateAdminApiKey({
  workspaceId,
  actualKey,
}: {
  workspaceId: string;
  actualKey: string;
}): Promise<boolean> {
  const apiKeysQuery = Prisma.sql`
      SELECT
        aak.id,
        s."configValue"
      FROM "AdminApiKey" aak
      JOIN "Secret" s ON aak."secretId" = s.id
      WHERE
        aak."workspaceId" = CAST(${workspaceId} AS UUID)
        OR aak."workspaceId" IN (
          SELECT wr."childWorkspaceId"
          FROM "WorkspaceRelation" wr
          WHERE wr."parentWorkspaceId" = CAST(${workspaceId} AS UUID)
        )
    `;
  const apiKeys =
    await prisma().$queryRaw<{ id: string; configValue: string }[]>(
      apiKeysQuery,
    );

  if (!actualKey) {
    return false;
  }
  let matchingKey = false;
  for (const apiKey of apiKeys) {
    const definitionResult = jsonParseSafe(apiKey.configValue).andThen(
      (configValue) => schemaValidate(configValue, AdminApiKeyDefinition),
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
  return matchingKey;
}

// eslint-disable-next-line @typescript-eslint/require-await
const adminAuth = fp(async (fastify: FastifyInstance) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const workspaceId = await getWorkspaceId(request);
    if (!workspaceId) {
      return reply.status(401).send();
    }
    const actualKey = request.headers.authorization?.trim().split(" ")[1];
    if (!actualKey) {
      return reply.status(401).send();
    }
    const authenticated = await authenticateAdminApiKey({
      workspaceId,
      actualKey,
    });
    if (!authenticated) {
      return reply.status(401).send();
    }
  });
});

export default adminAuth;
