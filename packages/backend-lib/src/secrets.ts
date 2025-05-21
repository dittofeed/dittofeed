import crypto from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { isStringPresent } from "isomorphic-lib/src/strings";

import config from "./config";
import { db } from "./db";
import { secret as dbSecret } from "./db/schema";
import { SecretAvailabilityResource } from "./types";
import logger from "./logger";

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

export function generateSecretKey(bytes = 32) {
  const buffer = crypto.randomBytes(bytes); // Generate 32 random bytes
  return buffer.toString("base64");
}

const ALGORITHM: crypto.CipherGCMTypes = "aes-256-gcm";
const IV_LENGTH = 16;

export function encrypt(
  plaintext: string,
  secretKey?: string,
): {
  iv: string;
  encryptedData: string;
  authTag: string;
} {
  const secretKeyString = secretKey ?? config().secretKey;

  if (!secretKeyString || typeof secretKeyString !== "string") {
    throw new Error(
      "Secret key is not set in config or is not a string. Please ensure 'secretKey' is configured.",
    );
  }

  // Convert the secretKeyString from config to a 32-byte Buffer for AES-256-GCM.
  // IMPORTANT: If your key is generated using crypto.randomBytes(32).toString('base64'),
  // as in the example `generateSecretKey` function, it MUST be decoded from base64.
  // If your key is stored in a different format (e.g., hex or a raw UTF-8 string that results in 32 bytes),
  // you would need to adjust the encoding parameter below accordingly (e.g., 'hex' or 'utf-8').
  const keyBuffer = Buffer.from(secretKeyString, "base64");

  if (keyBuffer.length !== 32) {
    throw new Error(
      `Invalid secret key length after encoding. Expected 32 bytes for AES-256-GCM, but got ${keyBuffer.length} bytes. ` +
        `Ensure the 'secretKey' in your configuration is correctly formatted (e.g., a UTF-8 string that yields 32 bytes, a 64-char hex string, or a ~44-char base64 string) ` +
        `and that the Buffer.from encoding parameter matches your key's storage format.`,
    );
  }

  // Convert keyBuffer to Uint8Array to satisfy TypeScript type checking for createCipheriv
  const keyUint8Array = new Uint8Array(
    keyBuffer.buffer,
    keyBuffer.byteOffset,
    keyBuffer.length,
  );

  const iv = crypto.randomBytes(IV_LENGTH); // iv is a Buffer
  // Convert iv Buffer to Uint8Array to satisfy TypeScript type checking for createCipheriv
  const ivUint8Array = new Uint8Array(iv.buffer, iv.byteOffset, iv.length);

  const cipher = crypto.createCipheriv(ALGORITHM, keyUint8Array, ivUint8Array);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    iv: iv.toString("hex"),
    encryptedData: encrypted,
    authTag,
  };
}

export function decrypt(parts: {
  iv: string;
  encryptedData: string;
  authTag: string;
  secretKey?: string;
}): string | null {
  const secretKeyString = parts.secretKey ?? config().secretKey;

  if (!secretKeyString || typeof secretKeyString !== "string") {
    // In a real scenario, you might throw or log more specifically
    logger().error(
      {
        secretKey: secretKeyString,
      },
      "Decryption failed: Secret key is not set in config or is not a string.",
    );
    return null;
  }

  // Decode the base64 secretKeyString to a Buffer
  const keyBuffer = Buffer.from(secretKeyString, "base64");

  if (keyBuffer.length !== 32) {
    logger().error(
      {
        keyBufferLength: keyBuffer.length,
      },
      "Decryption failed: Invalid secret key length after base64 decoding. Expected 32 bytes",
    );
    return null;
  }

  // Convert keyBuffer to Uint8Array
  const keyUint8Array = new Uint8Array(
    keyBuffer.buffer,
    keyBuffer.byteOffset,
    keyBuffer.length,
  );

  try {
    const ivBuffer = Buffer.from(parts.iv, "hex");
    const authTagBuffer = Buffer.from(parts.authTag, "hex");

    // Convert iv Buffer to Uint8Array
    const ivUint8Array = new Uint8Array(
      ivBuffer.buffer,
      ivBuffer.byteOffset,
      ivBuffer.length,
    );
    // Convert authTag Buffer to Uint8Array
    const authTagUint8Array = new Uint8Array(
      authTagBuffer.buffer,
      authTagBuffer.byteOffset,
      authTagBuffer.length,
    );

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      keyUint8Array,
      ivUint8Array,
    );
    decipher.setAuthTag(authTagUint8Array);

    let decrypted = decipher.update(parts.encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    logger().error(
      {
        err: error,
      },
      "Decryption failed",
    );
    return null;
  }
}
