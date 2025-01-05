import { randomBytes, randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { err, ok, Result } from "neverthrow";
import { PostgresError } from "pg-error-enum";

import { db, queryResult } from "./db";
import { adminApiKey as dbAdminApiKey, secret as dbSecret } from "./db/schema";
import {
  AdminApiKeyPermission,
  AdminApiKeyResource,
  AdminApiKeyType,
  CreateAdminApiKeyRequest,
  CreateAdminApiKeyResponse,
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
      const [secret] = await tx
        .insert(dbSecret)
        .values({
          id: randomUUID(),
          workspaceId: data.workspaceId,
          name: `df-admin-api-key-${data.name}`,
          configValue: {
            type: AdminApiKeyType.AdminApiKey,
            key,
            permissions: [AdminApiKeyPermission.Admin],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (!secret) {
        throw new Error("Failed to create secret");
      }
      const [adminApiKey] = await tx
        .insert(dbAdminApiKey)
        .values({
          id,
          name: data.name,
          workspaceId: data.workspaceId,
          secretId: secret.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (!adminApiKey) {
        throw new Error("Failed to create admin api key");
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
