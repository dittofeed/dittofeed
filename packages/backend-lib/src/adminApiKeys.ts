import { randomBytes, randomUUID } from "crypto";
import { err, ok, Result } from "neverthrow";

import prisma from "./prisma";
import {
  AdminApiKeyDefinition,
  AdminApiKeyPermission,
  AdminApiKeyType,
  CreateAdminApiKeyRequest,
  CreateAdminApiKeyResponse,
  Prisma,
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
  let isConflictError = false;

  try {
    await prisma().$transaction(async (tx) => {
      try {
        const secret = await tx.secret.create({
          data: {
            workspaceId: data.workspaceId,
            name: `df-admin-api-key-${data.name}`,
            configValue: {
              type: AdminApiKeyType.AdminApiKey,
              key,
              permissions: [AdminApiKeyPermission.Admin],
            } satisfies AdminApiKeyDefinition,
          },
        });
        await tx.adminApiKey.create({
          data: {
            id,
            name: data.name,
            workspaceId: data.workspaceId,
            secretId: secret.id,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          isConflictError = true;
        }
        throw error;
      }
    });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (isConflictError) {
      return err({ type: AdminApiKeyCreateErrorType.Conflict });
    }
  }
  return ok({
    workspaceId: data.workspaceId,
    apiKey: key,
    name: data.name,
    id,
  });
}
