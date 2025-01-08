import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import logger from "backend-lib/src/logger";
import { WorkspaceStatusDbEnum } from "backend-lib/src/types";
import { and, eq, inArray, or } from "drizzle-orm";
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
  let apiKeys: {
    id: string;
    workspaceId: string;
    configValue: unknown;
  }[];
  if ("workspaceId" in identifier) {
    const { workspaceId } = identifier;
    const parentWorkspaceQuery = db()
      .select({
        parentWorkspaceId: schema.workspaceRelation.parentWorkspaceId,
      })
      .from(schema.workspaceRelation)
      .where(eq(schema.workspaceRelation.childWorkspaceId, workspaceId));
    apiKeys = await db()
      .select({
        id: schema.adminApiKey.id,
        workspaceId: schema.adminApiKey.workspaceId,
        configValue: schema.secret.configValue,
      })
      .from(schema.adminApiKey)
      .innerJoin(
        schema.secret,
        eq(schema.adminApiKey.secretId, schema.secret.id),
      )
      .innerJoin(
        schema.workspace,
        eq(schema.adminApiKey.workspaceId, schema.workspace.id),
      )
      .where(
        and(
          eq(schema.workspace.status, WorkspaceStatusDbEnum.Active),
          or(
            eq(schema.adminApiKey.workspaceId, workspaceId),
            inArray(schema.adminApiKey.workspaceId, parentWorkspaceQuery),
          ),
        ),
      );
  } else {
    const { externalId } = identifier;
    const parentWorkspaceQuery = db()
      .select({
        parentWorkspaceId: schema.workspaceRelation.parentWorkspaceId,
      })
      .from(schema.workspaceRelation)
      .innerJoin(
        schema.workspace,
        eq(schema.workspaceRelation.childWorkspaceId, schema.workspace.id),
      )
      .where(eq(schema.workspace.externalId, externalId));
    apiKeys = await db()
      .select({
        id: schema.adminApiKey.id,
        workspaceId: schema.adminApiKey.workspaceId,
        configValue: schema.secret.configValue,
      })
      .from(schema.adminApiKey)
      .innerJoin(
        schema.secret,
        eq(schema.adminApiKey.secretId, schema.secret.id),
      )
      .innerJoin(
        schema.workspace,
        and(
          or(
            eq(schema.adminApiKey.workspaceId, schema.workspace.id),
            inArray(schema.adminApiKey.workspaceId, parentWorkspaceQuery),
          ),
          eq(schema.workspace.externalId, externalId),
        ),
      )
      .where(eq(schema.workspace.status, WorkspaceStatusDbEnum.Active));
  }

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
