import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { jsonParseSafeWithSchema } from "isomorphic-lib/src/resultHandling/schemaValidation";

const SsoStatePayload = Type.Object({
  csrf: Type.String(),
});

export type SsoStatePayload = Static<typeof SsoStatePayload>;

export function encodeSsoState(csrf: string): string {
  const json = JSON.stringify({ csrf } satisfies SsoStatePayload);
  return Buffer.from(json, "utf-8").toString("base64url");
}

export function decodeSsoState(
  stateParam: string | undefined,
): SsoStatePayload | null {
  if (!stateParam) {
    return null;
  }
  try {
    let base64 = stateParam.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const jsonString = Buffer.from(base64, "base64").toString("utf-8");
    const parsed = jsonParseSafeWithSchema(jsonString, SsoStatePayload);
    if (parsed.isErr()) {
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}
