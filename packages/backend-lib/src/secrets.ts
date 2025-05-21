import crypto from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { isStringPresent } from "isomorphic-lib/src/strings";

import { db } from "./db";
import { secret as dbSecret } from "./db/schema";
import { SecretAvailabilityResource } from "./types";
import config from "./config";

export async function getSecretAvailability({
  workspaceId,
  names,
}: {
  workspaceId: string;
  names?: string[];
}): Promise<SecretAvailabilityResource[]> {
  const secrets = await db().query.secret.findMany({
    where: and(
      eq(dbSecret.workspaceId, workspaceId),
      names ? inArray(dbSecret.name, names) : undefined,
    ),
  });
  return secrets.map((secret) => {
    let configValue: Record<string, boolean> | undefined;
    if (secret.configValue) {
      const existingConfigValue = secret.configValue as Record<string, string>;
      configValue = {};
      for (const key in existingConfigValue) {
        configValue[key] = isStringPresent(existingConfigValue[key]);
      }
    } else {
      configValue = undefined;
    }
    return {
      workspaceId: secret.workspaceId,
      name: secret.name,
      value: isStringPresent(secret.value),
      configValue,
    };
  });
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function encrypt(plaintext: string): {
  iv: string;
  encryptedData: string;
  authTag: string;
} {
  const { secretKey } = config();
  if (!secretKey) {
    throw new Error("Secret key is not set");
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, secretKey, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    iv: iv.toString("hex"),
    encryptedData: encrypted,
    authTag,
  };
}
