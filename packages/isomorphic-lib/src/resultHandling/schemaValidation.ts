import { Static, TSchema } from "@sinclair/typebox";
import { Value, ValueError } from "@sinclair/typebox/value";
import JsonBigint from "json-bigint";
import { err, ok, Result } from "neverthrow";

import { isObject } from "../objects";
import { TYPE_REFS } from "../typeRefs";
import { JSONValue } from "../types";

const JSON_BIG_INT = JsonBigint({ storeAsString: true });

export function schemaValidate<S extends TSchema>(
  val: unknown,
  schema: S,
): Result<Static<S>, ValueError[]> {
  if (Value.Check(schema, TYPE_REFS, val)) {
    return ok(val);
  }
  const errors = Array.from(Value.Errors(schema, val));
  return err(errors);
}

export function schemaValidateWithErr<S extends TSchema>(
  val: unknown,
  schema: S,
): Result<Static<S>, Error> {
  if (Value.Check(schema, TYPE_REFS, val)) {
    return ok(val);
  }
  const errors = Array.from(Value.Errors(schema, val));
  return err(
    new Error(
      `original object:${JSON.stringify(
        val,
      )}, parsing failure: ${JSON.stringify(errors)}`,
    ),
  );
}

export function jsonParseSafe(s: string): Result<JSONValue, Error> {
  try {
    return ok(JSON_BIG_INT.parse(s));
  } catch (e) {
    const error = new Error(`Failed to parse JSON: ${s}`);
    error.cause = e;
    return err(error);
  }
}

export function unwrapJsonObject(s?: string): Record<string, unknown> {
  if (!s) {
    return {};
  }
  return jsonParseSafe(s)
    .map((v) => (isObject(v) ? v : {}))
    .unwrapOr({});
}
