import { Static, TObject, Type } from "@sinclair/typebox";
import { constantCase } from "change-case";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";

export enum NodeEnvEnum {
  Development = "development",
  Test = "test",
  Production = "production",
}

export const NodeEnv = Type.Enum(NodeEnvEnum);

export type UnknownConfig = Record<string, unknown>;

export function loadConfig<S extends TObject, C = Static<S>>({
  schema,
  transform,
}: {
  schema: S;
  transform: (parsed: Static<S>) => C;
}): C {
  const unknownConfig: UnknownConfig = {};

  for (const key of Object.keys(schema.properties)) {
    unknownConfig[key] = process.env[constantCase(key)];
  }

  const parsed = unwrap(schemaValidate(unknownConfig, schema));
  return transform(parsed);
}

export function setConfigOnEnv(configForEnv: object) {
  for (const [key, value] of Object.entries(configForEnv)) {
    const serializedValue = Array.isArray(value) ? value.join(",") : value;
    const casedKey = constantCase(key);
    process.env[casedKey] = serializedValue;
  }
}
