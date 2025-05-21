import * as crypto from "crypto";

import { JSONValue } from "./types";

export function generateDigest({
  sharedSecret,
  rawBody,
}: {
  sharedSecret: string;
  rawBody: string;
}) {
  return crypto
    .createHmac("sha1", sharedSecret)
    .update(rawBody, "utf-8")
    .digest("hex");
}

export function verifyTimestampedSignature({
  publicKey,
  payload,
  signature,
  timestamp,
}: {
  publicKey: string;
  payload: string | Buffer;
  signature: string;
  timestamp: string;
}): boolean {
  const verifier = crypto.createVerify("sha256");
  const timestampedPayload =
    timestamp + (Buffer.isBuffer(payload) ? payload.toString("utf8") : payload);

  verifier.update(timestampedPayload, "utf8");

  return verifier.verify(publicKey, signature, "base64");
}

export function generateSecureHash({
  key,
  value,
}: {
  key: string;
  value: JSONValue;
}): string {
  const stringified = JSON.stringify(value);

  // Create a hmac object using the provided secret
  const hmac = crypto.createHmac("sha256", key);

  // Update the hmac with the stringified data
  hmac.update(stringified);

  // Generate the hash
  const hash = hmac.digest("hex");

  return hash;
}

export function generateSecureKey(length = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

export function trimTo32Bytes(base64String: string): string {
  // Decode the base64 string back to a Buffer
  const buffer = Buffer.from(base64String, "base64");

  // Check if the buffer is already 32 bytes or less
  if (buffer.length <= 32) {
    return base64String; // or return buffer.toString('base64') if you want to ensure it's base64
  }

  // Slice the buffer to the first 32 bytes
  const slicedBuffer = buffer.slice(0, 32);

  // Re-encode to base64
  const trimmedBase64 = slicedBuffer.toString("base64");

  return trimmedBase64;
}
