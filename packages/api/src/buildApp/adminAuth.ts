import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import logger from "backend-lib/src/logger";
import { WorkspaceStatusDbEnum } from "backend-lib/src/types";
import { and, eq, exists, or } from "drizzle-orm";
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
      .where(
        or(
          // Condition 1: API key belongs DIRECTLY to the target workspace, and that workspace is active.
          and(
            eq(schema.adminApiKey.workspaceId, workspaceId), // Key's workspace IS the target workspace
            exists(
              // And the target workspace is active
              db()
                .select({ id: schema.workspace.id })
                .from(schema.workspace)
                .where(
                  and(
                    eq(schema.workspace.id, workspaceId),
                    eq(schema.workspace.status, WorkspaceStatusDbEnum.Active),
                  ),
                ),
            ),
          ),
          // Condition 2: API key belongs to the PARENT of the target workspace,
          // and the target workspace is active, and the parent workspace (key owner) is also active.
          and(
            exists(
              // Check: target workspace is active AND its parent is the API key's workspace
              db()
                .select({ id: schema.workspace.id }) // Target workspace
                .from(schema.workspace)
                .where(
                  and(
                    eq(schema.workspace.id, workspaceId), // This is the target workspace
                    eq(schema.workspace.status, WorkspaceStatusDbEnum.Active), // Target is active
                    eq(
                      schema.workspace.parentWorkspaceId,
                      schema.adminApiKey.workspaceId,
                    ), // Target's parent is key's workspace
                  ),
                ),
            ),
            exists(
              // Also ensure the API key's own workspace (the parent) is active
              db()
                .select({ id: schema.workspace.id }) // API key's own workspace (parent)
                .from(schema.workspace)
                .where(
                  and(
                    eq(schema.workspace.id, schema.adminApiKey.workspaceId),
                    eq(schema.workspace.status, WorkspaceStatusDbEnum.Active),
                  ),
                ),
            ),
          ),
        ),
      );
  } else {
    const { externalId } = identifier;
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
      .where(
        or(
          // Condition 1: API key belongs to the workspace identified by externalId, and that workspace is active.
          exists(
            db()
              .select({ id: schema.workspace.id })
              .from(schema.workspace) // This is the key's workspace / target workspace
              .where(
                and(
                  eq(schema.workspace.id, schema.adminApiKey.workspaceId), // Key belongs to this workspace
                  eq(schema.workspace.externalId, externalId), // This workspace has the given externalId
                  eq(schema.workspace.status, WorkspaceStatusDbEnum.Active), // And this workspace is active
                ),
              ),
          ),
          // Condition 2: API key belongs to the PARENT of the workspace identified by externalId.
          // Both the target workspace (with externalId) and the parent workspace (key owner) must be active.
          and(
            exists(
              // Check: target workspace (identified by externalId) is active AND its parent is the API key's workspace
              db()
                .select({ id: schema.workspace.id }) // Target workspace
                .from(schema.workspace)
                .where(
                  and(
                    eq(schema.workspace.externalId, externalId), // Target has the externalId
                    eq(schema.workspace.status, WorkspaceStatusDbEnum.Active), // Target is active
                    eq(
                      schema.workspace.parentWorkspaceId,
                      schema.adminApiKey.workspaceId,
                    ), // Target's parent is key's workspace
                  ),
                ),
            ),
            exists(
              // Also ensure the API key's own workspace (the parent) is active
              db()
                .select({ id: schema.workspace.id }) // API key's own workspace (parent)
                .from(schema.workspace)
                .where(
                  and(
                    eq(schema.workspace.id, schema.adminApiKey.workspaceId),
                    eq(schema.workspace.status, WorkspaceStatusDbEnum.Active),
                  ),
                ),
            ),
          ),
        ),
      );
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
      const errorMessage = "workspace identifier missing for request";
      logger().info(
        {
          path: request.url,
          method: request.method,
        },
        errorMessage,
      );
      return reply.status(401).send({
        message: errorMessage,
      });
    }
    if (!request.headers.authorization) {
      const errorMessage = "No authorization header";
      logger().info(
        {
          path: request.url,
          method: request.method,
        },
        errorMessage,
      );
      return reply.status(401).send({
        message: errorMessage,
      });
    }
    const splitAuth = request.headers.authorization.trim().split(" ");
    if (splitAuth.length !== 2 || splitAuth[0] !== "Bearer") {
      const errorMessage = "Invalid authorization header";
      logger().info(
        {
          path: request.url,
          method: request.method,
        },
        errorMessage,
      );
      return reply.status(401).send({
        message: errorMessage,
      });
    }
    const actualKey = splitAuth[1];
    if (!actualKey) {
      const errorMessage = "API key missing for request";
      logger().info(
        {
          path: request.url,
          method: request.method,
        },
        errorMessage,
      );
      return reply.status(401).send({
        message: errorMessage,
      });
    }
    const authenticated = await authenticateAdminApiKey({
      ...workspaceIdentifier,
      actualKey,
    });
    if (!authenticated) {
      const errorMessage = "API key not valid";
      logger().info(
        {
          path: request.url,
          method: request.method,
          ...workspaceIdentifier,
        },
        errorMessage,
      );
      return reply.status(401).send({
        message: errorMessage,
      });
    }
  });
});

export default adminAuth;
