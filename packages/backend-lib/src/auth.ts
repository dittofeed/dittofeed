import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { createDecoder } from "fast-jwt";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { validate } from "uuid";

import { generateSecureKey } from "./crypto";
import { db } from "./db";
import { secret as dbSecret, writeKey as dbWriteKey } from "./db/schema";
import logger from "./logger";
import { OpenIdProfile, WriteKeyResource } from "./types";

const decoder = createDecoder();

export function decodeJwtHeader(header: string): OpenIdProfile | null {
  const bearerToken = header.replace("Bearer ", "");
  const decoded: unknown | null = bearerToken ? decoder(bearerToken) : null;

  if (!decoded) {
    return null;
  }
  const result = schemaValidate(decoded, OpenIdProfile);
  if (result.isErr()) {
    return null;
  }
  return result.value;
}

/**
 *
 * @param writeKey Authorization header of the form "basic <encodedWriteKey>".
 * The write key is encoded in base64, taking the form base64(secretKeyId:secretKeyValue).
 * @returns if the writeKey is valid, returns the workspace id, otherwise returns null
 */
export async function validateWriteKey({
  writeKey,
}: {
  writeKey: string;
}): Promise<string | null> {
  // Extract the encodedWriteKey from the header
  const encodedWriteKey = writeKey.split(" ")[1];
  if (!encodedWriteKey) {
    return null;
  }

  // Decode the writeKey
  const decodedWriteKey = Buffer.from(encodedWriteKey, "base64").toString(
    "utf-8",
  );

  // Split the writeKey into secretKeyId and secretKeyValue
  const [secretKeyId, secretKeyValue] = decodedWriteKey.split(":");

  if (!secretKeyId || !validate(secretKeyId)) {
    return null;
  }

  const writeKeySecret = await db().query.secret.findFirst({
    where: eq(dbSecret.id, secretKeyId),
  });

  if (!writeKeySecret) {
    return null;
  }

  // Compare the secretKeyValue with the value from the database
  return writeKeySecret.value === secretKeyValue
    ? writeKeySecret.workspaceId
    : null;
}

export async function getOrCreateWriteKey({
  writeKeyName,
  workspaceId,
}: {
  workspaceId: string;
  writeKeyName: string;
}): Promise<WriteKeyResource> {
  const writeKeyValue = generateSecureKey(8);
  logger().debug(
    {
      writeKeyName,
      workspaceId,
      writeKeyValue,
    },
    "creating write key",
  );
  return db().transaction(async (tx) => {
    const existingSecret = await tx.query.secret.findFirst({
      where: and(
        eq(dbSecret.workspaceId, workspaceId),
        eq(dbSecret.name, writeKeyName),
      ),
      with: {
        writeKeys: true,
      },
    });
    const existingWriteKey = existingSecret?.writeKeys[0];

    if (existingWriteKey && existingSecret.value) {
      return {
        workspaceId: existingSecret.workspaceId,
        writeKeyName: existingSecret.name,
        writeKeyValue: existingSecret.value,
        secretId: existingSecret.id,
      } satisfies WriteKeyResource;
    }

    // Try to find the secret, create if it doesn't exist
    const [secret] = await tx
      .insert(dbSecret)
      .values({
        id: randomUUID(),
        workspaceId,
        name: writeKeyName,
        value: writeKeyValue,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .returning();
    if (!secret) {
      throw new Error("Failed to create secret");
    }

    // Try to find the writeKey, create if it doesn't exist
    await tx
      .insert(dbWriteKey)
      .values({
        id: randomUUID(),
        secretId: secret.id,
        workspaceId,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing();
    return {
      workspaceId,
      writeKeyName,
      writeKeyValue,
      secretId: secret.id,
    } satisfies WriteKeyResource;
  });
}

export async function getWriteKeys({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<WriteKeyResource[]> {
  const writeKeys = await prisma().writeKey.findMany({
    where: {
      workspaceId,
    },
    select: {
      secret: {
        select: {
          name: true,
          value: true,
          id: true,
        },
      },
    },
  });
  return writeKeys.flatMap((writeKey) => {
    if (!writeKey.secret.value) {
      return [];
    }
    return {
      writeKeyName: writeKey.secret.name,
      writeKeyValue: writeKey.secret.value,
      secretId: writeKey.secret.id,
      workspaceId,
    };
  });
}
