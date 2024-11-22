import logger from "backend-lib/src/logger";
import prisma, { Prisma } from "backend-lib/src/prisma";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  AdminApiKeyDefinition,
  WorkspaceIdentifier,
} from "isomorphic-lib/src/types";

import { getWorkspaceIdentifier } from "../workspace";

export type AuthenticateAdminKeyParams = {
  actualKey: string;
} & WorkspaceIdentifier;

export async function authenticateAdminApiKeyFull({
  actualKey,
  ...identifier
}: AuthenticateAdminKeyParams): Promise<{
  workspaceId: string;
  keyId: string;
} | null> {
  let apiKeysQuery: Prisma.Sql;
  if ("workspaceId" in identifier) {
    const { workspaceId } = identifier;

    apiKeysQuery = Prisma.sql`
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
  } else {
    const { externalId } = identifier;
    apiKeysQuery = Prisma.sql`
      SELECT
        aak.id,
        aak."workspaceId",
        s."configValue"
      FROM "AdminApiKey" aak
      JOIN "Secret" s ON aak."secretId" = s.id
      JOIN "Workspace" w ON
        (aak."workspaceId" = w.id AND w."externalId" = ${externalId})
        OR aak."workspaceId" IN (
          SELECT wr."parentWorkspaceId"
          FROM "WorkspaceRelation" wr
          JOIN "Workspace" cw ON wr."childWorkspaceId" = cw.id
          WHERE cw."externalId" = ${externalId}
        )
    `;
  }
  const apiKeys =
    await prisma().$queryRaw<
      { id: string; workspaceId: string; configValue: unknown }[]
    >(apiKeysQuery);

  if (!actualKey) {
    logger().info(
      {
        ...identifier,
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
          ...identifier,
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
      ...identifier,
      actualKey,
      apiKeys,
    },
    "API key not found among workspace's API keys",
  );
  return null;
}

export async function authenticateAdminApiKey(
  params: AuthenticateAdminKeyParams,
): Promise<boolean> {
  const apiKeyId = await authenticateAdminApiKeyFull(params);
  return apiKeyId !== null;
}

// eslint-disable-next-line @typescript-eslint/require-await
const adminAuth = fp(async (fastify: FastifyInstance) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const workspaceIdentifierResult = await getWorkspaceIdentifier(request);
    if (workspaceIdentifierResult.isErr()) {
      logger().info(
        {
          err: workspaceIdentifierResult.error,
          path: request.url,
          method: request.method,
        },
        "Error getting workspace identifier for admin auth",
      );
      return reply.status(400).send({
        message: workspaceIdentifierResult.error.message,
      });
    }
    const workspaceIdentifier = workspaceIdentifierResult.value;
    if (!workspaceIdentifier) {
      logger().info(
        {
          path: request.url,
          method: request.method,
        },
        "workspace identifier missing for request",
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
      ...workspaceIdentifier,
      actualKey,
    });
    if (!authenticated) {
      logger().info(
        {
          path: request.url,
          method: request.method,
          ...workspaceIdentifier,
        },
        "API key not authenticated",
      );
      return reply.status(401).send();
    }
  });
});

export default adminAuth;
