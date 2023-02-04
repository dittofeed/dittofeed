import { Static, TSchema, Type } from "@sinclair/typebox";
import { constantCase } from "change-case";
import dotenv from "dotenv";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import path from "path";

export enum NodeEnvEnum {
  Development = "development",
  Test = "test",
  Production = "production",
}

export const NodeEnv = Type.Enum(NodeEnvEnum);

export type UnknownConfig = Record<string, unknown>;

export function loadConfig<S extends TSchema, C = Static<S>>({
  schema,
  keys,
  transform,
}: {
  schema: S;
  keys: string[];
  transform: (parsed: Static<S>) => C;
}): C {
  dotenv.config();
  dotenv.config({ path: path.join("/dittofeed-mnt", ".env") });

  const unknownConfig: UnknownConfig = {};

  for (const key of keys) {
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
