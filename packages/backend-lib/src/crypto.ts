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
    .update(Buffer.from(rawBody, "utf-8"))
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

export function encrypt({ text, key }: { text: string; key: string }) {
  const cipher = crypto.createCipher("aes-256-cbc", key);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}
