import { randomBytes, randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { err, ok, Result } from "neverthrow";
import { PostgresError } from "pg-error-enum";

import { db, queryResult } from "./db";
import { adminApiKey as dbAdminApiKey, secret as dbSecret } from "./db/schema";
import {
  AdminApiKey,
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
  const key = randomBytes(32).toString("hex");
  const id = randomUUID();

  const result = await queryResult(
    db().transaction(async (tx) => {
      const name = `df-admin-api-key-${data.name}`;
      const existingSecret = await tx.query.secret.findFirst({
        where: and(
          eq(dbSecret.workspaceId, data.workspaceId),
          eq(dbSecret.name, name),
        ),
      });
      let secret: Secret;
      if (existingSecret) {
        secret = existingSecret;
      } else {
        const [newSecret] = await tx
          .insert(dbSecret)
          .values({
            workspaceId: data.workspaceId,
            name: `df-admin-api-key-${data.name}`,
            configValue: {
              type: AdminApiKeyType.AdminApiKey,
              key,
              permissions: [AdminApiKeyPermission.Admin],
            },
          })
          .returning();

        if (!newSecret) {
          throw new Error("Failed to create secret");
        }
        secret = newSecret;
      }
      const existingAdminApiKey = await tx.query.adminApiKey.findFirst({
        where: and(
          eq(dbAdminApiKey.workspaceId, data.workspaceId),
          eq(dbAdminApiKey.name, name),
        ),
      });
      let adminApiKey: AdminApiKey;
      if (existingAdminApiKey) {
        adminApiKey = existingAdminApiKey;
      } else {
        const [newAdminApiKey] = await tx
          .insert(dbAdminApiKey)
          .values({
            id,
            name: data.name,
            workspaceId: data.workspaceId,
            secretId: secret.id,
          })
          .returning();

        if (!newAdminApiKey) {
          throw new Error("Failed to create admin api key");
        }
        adminApiKey = newAdminApiKey;
      }
      return adminApiKey;
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
  return ok({
    workspaceId: data.workspaceId,
    apiKey: key,
    name: data.name,
    id,
    createdAt: result.value.createdAt.getTime(),
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
