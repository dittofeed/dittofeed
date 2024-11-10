import { toJsonPathParam } from "isomorphic-lib/src/jsonPath";
import jp from "jsonpath";
import { err, ok, Result } from "neverthrow";

import { JSONValue } from "./types";

export function jsonValue({
  data,
  path: rawPath,
}: {
  data: unknown;
  path: string;
}): Result<JSONValue, Error> {
  const normalizedPathResult = toJsonPathParam({ path: rawPath });
  if (normalizedPathResult.isErr()) {
    return err(normalizedPathResult.error);
  }
  const path = normalizedPathResult.value;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const value: JSONValue = jp.value(data, path);
  return ok(value);
}
