import { Static, Type } from "@sinclair/typebox";
import {
  loadConfig,
  NodeEnv,
  setConfigOnEnv,
} from "backend-lib/src/config/loader";
import { Overwrite } from "utility-types";

// Structure of application config.
const RawConfig = Type.Object(
  {
    nodeEnv: Type.Optional(NodeEnv),
    port: Type.Optional(Type.String()),
    host: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);

type RawConfig = Static<typeof RawConfig>;

export type Config = Overwrite<
  RawConfig,
  {
    nodeEnv: string;
    host: string;
    port: number;
  }
>;
function parseRawConfig(raw: RawConfig): Config {
  const nodeEnv = raw.nodeEnv ?? "development";
  const port = Number(raw.port);

  return {
    ...raw,
    nodeEnv,
    host: raw.host ?? (nodeEnv === "development" ? "localhost" : "0.0.0.0"),
    port: Number.isNaN(port) ? 3001 : port,
  };
}

// Singleton configuration object used by application.
let CONFIG: Config | null = null;

export default function config(): Config {
  if (!CONFIG) {
    CONFIG = loadConfig({ schema: RawConfig, transform: parseRawConfig });
    setConfigOnEnv(CONFIG);
  }
  return CONFIG;
}
