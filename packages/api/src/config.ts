import { Static, Type } from "@sinclair/typebox";
import { loadConfig, setConfigOnEnv } from "backend-lib/src/config/loader";
import { NodeEnv } from "backend-lib/src/types";
import { Overwrite } from "utility-types";

const RawConfigProps = {
  nodeEnv: Type.Optional(NodeEnv),
  apiServiceName: Type.Optional(Type.String()),
  apiPort: Type.Optional(
    Type.String({
      format: "naturalNumber",
    }),
  ),
  apiHost: Type.Optional(Type.String()),
  apiPrefix: Type.Optional(Type.String()),
  apiBodyLimit: Type.Optional(
    Type.String({
      format: "naturalNumber",
    }),
  ),
};

// Structure of application config.
const RawConfig = Type.Object(RawConfigProps);

type RawConfig = Static<typeof RawConfig>;

export type Config = Overwrite<
  RawConfig,
  {
    nodeEnv: string;
    apiServiceName: string;
    apiHost: string;
    apiPort: number;
    apiBodyLimit: number;
  }
>;
function parseRawConfig(raw: RawConfig): Config {
  const nodeEnv = raw.nodeEnv ?? "development";
  const port = Number(raw.apiPort);
  const bodyLimit = Number(raw.apiBodyLimit);

  return {
    ...raw,
    apiServiceName: raw.apiServiceName ?? "dittofeed-api",
    nodeEnv,
    apiHost:
      raw.apiHost ?? (nodeEnv === "development" ? "localhost" : "0.0.0.0"),
    apiPort: Number.isNaN(port) ? 3001 : port,
    apiBodyLimit: Number.isNaN(bodyLimit) ? 5 * 1024 * 1024 : bodyLimit,
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
