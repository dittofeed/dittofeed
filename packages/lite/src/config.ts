import { Static, Type } from "@sinclair/typebox";
import { loadConfig, setConfigOnEnv } from "backend-lib/src/config/loader";
import { NodeEnv } from "backend-lib/src/types";
import { Overwrite } from "utility-types";

const RawConfigProps = {
  nodeEnv: Type.Optional(NodeEnv),
  serviceName: Type.Optional(Type.String()),
  port: Type.Optional(
    Type.String({
      format: "naturalNumber",
    }),
  ),
  host: Type.Optional(Type.String()),
};

// Structure of application config.
const RawConfig = Type.Object(RawConfigProps);

type RawConfig = Static<typeof RawConfig>;

export type Config = Overwrite<
  RawConfig,
  {
    nodeEnv: string;
    serviceName: string;
    host: string;
    port: number;
  }
>;
function parseRawConfig(raw: RawConfig): Config {
  const nodeEnv = raw.nodeEnv ?? "development";
  const port = Number(raw.port);

  return {
    ...raw,
    serviceName: raw.serviceName ?? "dittofeed-lite",
    nodeEnv,
    host: raw.host ?? (nodeEnv === "development" ? "localhost" : "0.0.0.0"),
    port: Number.isNaN(port) ? 3000 : port,
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
