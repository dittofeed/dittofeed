import { Static, TSchema } from "@sinclair/typebox";
import { Value, ValueError } from "@sinclair/typebox/value";
import { err, ok, Result } from "neverthrow";

import { JSONValue } from "../types";

export function schemaValidate<S extends TSchema>(
  val: unknown,
  schema: S
): Result<Static<S>, ValueError[]> {
  if (Value.Check(schema, val)) {
    return ok(val);
  }
  const errors = Array.from(Value.Errors(schema, val));
  return err(errors);
}

export function schemaValidateWithErr<S extends TSchema>(
  val: unknown,
  schema: S
): Result<Static<S>, Error> {
  if (Value.Check(schema, val)) {
    return ok(val);
  }
  const errors = Array.from(Value.Errors(schema, val));
  return err(new Error(JSON.stringify(errors)));
}

export function jsonParseSafe(s: string): Result<JSONValue, Error> {
  try {
    return ok(JSON.parse(s));
  } catch (e) {
    return err(e as Error);
  }
}
