import { createDecoder } from "fast-jwt";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { validate } from "uuid";

import logger from "./logger";
import prisma from "./prisma";
import { DecodedJwt, WriteKeyResource } from "./types";

const decoder = createDecoder();

export function decodeJwtHeader(header: string): DecodedJwt | null {
  const bearerToken = header.replace("Bearer ", "");
  const decoded: unknown | null = bearerToken ? decoder(bearerToken) : null;

  if (!decoded) {
    return null;
  }
  const result = schemaValidate(decoded, DecodedJwt);
  if (result.isErr()) {
    return null;
  }
  return result.value;
}

/**
 *
 * @param writeKey Authorization header of the form "basic <encodedWriteKey>".
 * The write key is encoded in base64, taking the form base64(secretKeyId:secretKeyValue).
 * @returns a boolean indicating whether the write key is valid.
 */
export async function validateWriteKey({
  writeKey,
}: {
  writeKey: string;
}): Promise<boolean> {
  // Extract the encodedWriteKey from the header
  const encodedWriteKey = writeKey.split(" ")[1];
  if (!encodedWriteKey) {
    return false;
  }

  // Decode the writeKey
  const decodedWriteKey = Buffer.from(encodedWriteKey, "base64").toString(
    "utf-8"
  );

  // Split the writeKey into secretKeyId and secretKeyValue
  const [secretKeyId, secretKeyValue] = decodedWriteKey.split(":");

  if (!secretKeyId || !validate(secretKeyId)) {
    return false;
  }

  const writeKeySecret = await prisma().secret.findUnique({
    where: {
      id: secretKeyId,
    },
  });

  // Compare the secretKeyValue with the value from the database
  return writeKeySecret?.value === secretKeyValue;
}

export async function createWriteKey({
  writeKeyValue,
  writeKeyName,
  workspaceId,
}: {
  workspaceId: string;
  writeKeyValue: string;
  writeKeyName: string;
}): Promise<WriteKeyResource> {
  logger().info(
    {
      writeKeyName,
      workspaceId,
    },
    "creating write key"
  );
  const resource = await prisma().$transaction(async (tx) => {
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
  return writeKeys.map((writeKey) => ({
    writeKeyName: writeKey.secret.name,
    writeKeyValue: writeKey.secret.value,
    secretId: writeKey.secret.id,
    workspaceId,
  }));
}
