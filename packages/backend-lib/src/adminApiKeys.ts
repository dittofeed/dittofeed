import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";
import { PostgresError } from "pg-error-enum";

import { db, queryResult } from "./db";
import { adminApiKey as dbAdminApiKey, secret as dbSecret } from "./db/schema";
import logger from "./logger";
import {
  AdminApiKey,
  AdminApiKeyDefinition,
  AdminApiKeyPermission,
  AdminApiKeyResource,
  AdminApiKeyType,
  CreateAdminApiKeyRequest,
  CreateAdminApiKeyResponse,
  Secret,
} from "./types";

export enum AdminApiKeyCreateErrorType {
  Conflict = "Conflict",
}

export interface AdminApiKeyCreateConflictError {
  type: AdminApiKeyCreateErrorType.Conflict;
}

export type AdminApiKeyCreateError = AdminApiKeyCreateConflictError;

export async function createAdminApiKey(
  data: CreateAdminApiKeyRequest,
): Promise<Result<CreateAdminApiKeyResponse, AdminApiKeyCreateError>> {
  const newKey = randomBytes(32).toString("hex");

  const result = await queryResult(
    db().transaction(async (tx) => {
      const name = `df-admin-api-key-${data.name}`;
      logger().debug({ name }, "looking for existing secret");
      const existingSecret = await tx.query.secret.findFirst({
        where: and(
          eq(dbSecret.workspaceId, data.workspaceId),
          eq(dbSecret.name, name),
        ),
      });
      let secret: Secret;
      if (existingSecret) {
        secret = existingSecret;
        logger().debug({ secret }, "found existing secret");
      } else {
        logger().debug("creating new secret");
        const [newSecret] = await tx
          .insert(dbSecret)
          .values({
            workspaceId: data.workspaceId,
            name: `df-admin-api-key-${data.name}`,
            configValue: {
              type: AdminApiKeyType.AdminApiKey,
              key: newKey,
              permissions: [AdminApiKeyPermission.Admin],
            },
          })
          .returning();

        logger().debug({ newSecret }, "created new secret");
        if (!newSecret) {
          throw new Error("Failed to create secret");
        }
        secret = newSecret;
      }

      logger().debug({ name }, "looking for existing admin api key");
      const existingAdminApiKey = await tx.query.adminApiKey.findFirst({
        where: and(
          eq(dbAdminApiKey.workspaceId, data.workspaceId),
          eq(dbAdminApiKey.name, data.name),
        ),
      });
      let adminApiKey: AdminApiKey;
      if (existingAdminApiKey) {
        adminApiKey = existingAdminApiKey;
        logger().debug({ adminApiKey }, "found existing admin api key");
      } else {
        const [newAdminApiKey] = await tx
          .insert(dbAdminApiKey)
          .values({
            name: data.name,
            workspaceId: data.workspaceId,
            secretId: secret.id,
          })
          .returning();

        logger().debug({ newAdminApiKey }, "created new admin api key");

        if (!newAdminApiKey) {
          throw new Error("Failed to create admin api key");
        }
        adminApiKey = newAdminApiKey;
      }
      return {
        adminApiKey,
        secret,
      };
    }),
  );
  if (result.isErr()) {
    if (
      result.error.code === PostgresError.UNIQUE_VIOLATION ||
      result.error.code === PostgresError.FOREIGN_KEY_VIOLATION
    ) {
      return err({ type: AdminApiKeyCreateErrorType.Conflict });
    }
    throw result.error;
  }
  const secretConfig = unwrap(
    schemaValidateWithErr(
      result.value.secret.configValue,
      AdminApiKeyDefinition,
    ),
  );
  return ok({
    workspaceId: data.workspaceId,
    apiKey: secretConfig.key,
    name: data.name,
    id: result.value.adminApiKey.id,
    createdAt: result.value.adminApiKey.createdAt.getTime(),
  });
}

export async function getAdminApiKeys({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<AdminApiKeyResource[]> {
  const keys = await db()
    .select()
    .from(dbAdminApiKey)
    .where(eq(dbAdminApiKey.workspaceId, workspaceId));
  return keys.map((key) => ({
    workspaceId,
    id: key.id,
    name: key.name,
    createdAt: key.createdAt.getTime(),
  }));
}
