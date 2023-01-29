import { Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { constantCase } from "change-case";
import * as dotenv from "dotenv";
import * as path from "path";

enum NodeEnv {
  Development = "development",
  Test = "test",
  Production = "production",
}

const NodeEnvEnum = Type.Enum(NodeEnv);
type NodeEnvEnum = Static<typeof NodeEnvEnum>;

// Structure of application config.
const configInterface = Type.Object(
  {
    nodeEnv: NodeEnvEnum,
    gcpProjectId: Type.String(),
    port: Type.String(),
  },
  { additionalProperties: false }
);

type Config = Static<typeof configInterface>;

type UnknownConfig = Record<string, unknown>;

export function initializeConfig(): Config {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
  dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

  const unknownConfig: UnknownConfig = {};

  for (const key of Object.keys(configInterface.properties)) {
    unknownConfig[key] = process.env[constantCase(key)];
  }

  if (Value.Check(configInterface, unknownConfig)) {
    return unknownConfig;
  }
  console.log(
    "loc1",
    JSON.stringify(Value.Errors(configInterface, unknownConfig))
  );
  throw new Error(JSON.stringify(Value.Errors(configInterface, unknownConfig)));
}

// Singleton configuration object used by application.
let CONFIG: Config | null = null;

export default function config(): Config {
  if (!CONFIG) {
    CONFIG = initializeConfig();
  }
  return CONFIG;
}

export function host(): string {
  return config().nodeEnv === "development" ? "localhost" : "0.0.0.0";
}

export function port(): number {
  return Number(config().port);
}
