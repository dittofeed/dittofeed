import { Static, Type } from "@sinclair/typebox";
import { loadConfig, setConfigOnEnv } from "backend-lib/src/config/loader";

// Structure of application config.
const RawConfig = Type.Object(
  {
    temporalAddress: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);

type RawConfig = Static<typeof RawConfig>;

interface Config {
  temporalAddress: string;
}

function parseRawConfig(raw: RawConfig): Config {
  return {
    ...raw,
    temporalAddress: raw.temporalAddress ?? "localhost:7233",
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
