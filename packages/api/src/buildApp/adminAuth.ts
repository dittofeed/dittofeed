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
}): Promise<{ workspaceId: string; keyId: string } | null> {
  const apiKeysQuery = Prisma.sql`
      SELECT
        aak.id,
        aak."workspaceId",
        s."configValue"
      FROM "AdminApiKey" aak
      JOIN "Secret" s ON aak."secretId" = s.id
      WHERE
        aak."workspaceId" = CAST(${workspaceId} AS UUID)
        OR aak."workspaceId" IN (
          SELECT wr."parentWorkspaceId"
          FROM "WorkspaceRelation" wr
          WHERE wr."childWorkspaceId" = CAST(${workspaceId} AS UUID)
        )
    `;
  const apiKeys =
    await prisma().$queryRaw<
      { id: string; workspaceId: string; configValue: unknown }[]
    >(apiKeysQuery);

  if (!actualKey) {
    logger().info(
      {
        workspaceId,
      },
      "Empty API key",
    );
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
        return {
          workspaceId: apiKey.workspaceId,
          keyId: apiKey.id,
        };
      }
    }
  }

  logger().debug(
    {
      workspaceId,
      actualKey,
      apiKeys,
    },
    "API key not found among workspace's API keys",
  );
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
      logger().info(
        {
          err: workspaceIdResult.error,
          path: request.url,
          method: request.method,
        },
        "Error getting workspaceId for admin auth",
      );
      return reply.status(400).send();
    }
    const workspaceId = workspaceIdResult.value;
    if (!workspaceId) {
      logger().info(
        {
          path: request.url,
          method: request.method,
        },
        "workspace id missing for request",
      );
      return reply.status(401).send();
    }
    const actualKey = request.headers.authorization?.trim().split(" ")[1];
    if (!actualKey) {
      logger().info(
        {
          path: request.url,
          method: request.method,
        },
        "API key missing for request",
      );
      return reply.status(401).send();
    }
    const authenticated = await authenticateAdminApiKey({
      workspaceId,
      actualKey,
    });
    if (!authenticated) {
      logger().info(
        {
          path: request.url,
          method: request.method,
          workspaceId,
        },
        "API key not authenticated",
      );
      return reply.status(401).send();
    }
  });
});

export default adminAuth;
