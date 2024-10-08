import { createDecoder } from "fast-jwt";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { validate } from "uuid";

import { generateSecureKey } from "./crypto";
import logger from "./logger";
import prisma from "./prisma";
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

  const writeKeySecret = await prisma().secret.findUnique({
    where: {
      id: secretKeyId,
    },
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
  logger().info(
    {
      writeKeyName,
      workspaceId,
    },
    "creating write key",
  );
  const writeKeyValue = generateSecureKey(8);

  const resource = await prisma().$transaction(async (tx) => {
    const existingSecret = await tx.secret.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: writeKeyName,
        },
      },
      include: {
        WriteKey: true,
      },
    });
    const existingWriteKey = existingSecret?.WriteKey[0];
    if (existingSecret?.value && existingWriteKey) {
      return {
        workspaceId: existingSecret.workspaceId,
        writeKeyName: existingSecret.name,
        writeKeyValue: existingSecret.value,
        secretId: existingSecret.id,
      };
    }
    // Try to find the secret, create if it doesn't exist
    const secret = await tx.secret.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: writeKeyName,
        },
      },
      update: {},
      create: {
        workspaceId,
        name: writeKeyName,
        value: writeKeyValue,
      },
    });

    // Try to find the writeKey, create if it doesn't exist
    await tx.writeKey.upsert({
      where: {
        workspaceId_secretId: {
          workspaceId,
          secretId: secret.id,
        },
      },
      update: {},
      create: {
        workspaceId,
        secretId: secret.id,
      },
    });
    return {
      workspaceId,
      writeKeyName,
      writeKeyValue,
      secretId: secret.id,
    };
  });

  return resource;
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
