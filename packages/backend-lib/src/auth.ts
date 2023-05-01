import { createDecoder } from "fast-jwt";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";

import { DecodedJwt } from "./types";

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
