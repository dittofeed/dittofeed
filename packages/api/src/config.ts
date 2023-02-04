import { Static, Type } from "@sinclair/typebox";
import {
  loadConfig,
  NodeEnv,
  setConfigOnEnv,
} from "backend-lib/src/config/loader";
import { Overwrite } from "utility-types";

const RawConfigProps = {
  nodeEnv: Type.Optional(NodeEnv),
  apiPort: Type.Optional(Type.String()),
  apiHost: Type.Optional(Type.String()),
};

// Structure of application config.
const RawConfig = Type.Object(RawConfigProps);

type RawConfig = Static<typeof RawConfig>;

export type Config = Overwrite<
  RawConfig,
  {
    nodeEnv: string;
    apiHost: string;
    apiPort: number;
  }
>;
function parseRawConfig(raw: RawConfig): Config {
  const nodeEnv = raw.nodeEnv ?? "development";
  const port = Number(raw.apiPort);

  return {
    ...raw,
    nodeEnv,
    apiHost:
      raw.apiHost ?? (nodeEnv === "development" ? "localhost" : "0.0.0.0"),
    apiPort: Number.isNaN(port) ? 3001 : port,
  };
}

// Singleton configuration object used by application.
let CONFIG: Config | null = null;

export default function config(): Config {
  if (!CONFIG) {
    CONFIG = loadConfig({
      schema: RawConfig,
      transform: parseRawConfig,
      keys: Object.keys(RawConfigProps),
    });
    setConfigOnEnv(CONFIG);
  }
  return CONFIG;
}
