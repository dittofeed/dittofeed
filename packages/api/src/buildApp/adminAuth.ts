import logger from "backend-lib/src/logger";
import prisma, { Prisma } from "backend-lib/src/prisma";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { AdminApiKeyDefinition } from "isomorphic-lib/src/types";

import { getWorkspaceId } from "../workspace";

export async function authenticateAdminApiKeyFull({
  workspaceId,
  actualKey,
}: {
  workspaceId: string;
  actualKey: string;
}): Promise<string | null> {
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
    await prisma().$queryRaw<{ id: string; configValue: unknown }[]>(
      apiKeysQuery,
    );

  if (!actualKey) {
    return null;
  }
  for (const apiKey of apiKeys) {
    const definitionResult = schemaValidate(
      apiKey.configValue,
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
        return apiKey.id;
      }
    }
  }
  return null;
}

export async function authenticateAdminApiKey({
  workspaceId,
  actualKey,
}: {
  workspaceId: string;
  actualKey: string;
}): Promise<boolean> {
  const apiKeyId = await authenticateAdminApiKeyFull({
    workspaceId,
    actualKey,
  });
  return apiKeyId !== null;
}

// eslint-disable-next-line @typescript-eslint/require-await
const adminAuth = fp(async (fastify: FastifyInstance) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const workspaceIdResult = await getWorkspaceId(request);
    if (workspaceIdResult.isErr()) {
      return reply.status(400).send();
    }
    const workspaceId = workspaceIdResult.value;
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
