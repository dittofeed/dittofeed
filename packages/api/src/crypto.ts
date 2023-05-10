import * as crypto from "crypto";

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

export function generateSecureHash({
  key,
  value,
}: {
  key: string;
  value: string;
}): string {
  return "";
}
