import { Static, Type } from "@sinclair/typebox";
import { loadConfig, setConfigOnEnv } from "backend-lib/src/config/loader";

// Structure of application config.
const RawConfig = Type.Object({}, { additionalProperties: false });

type RawConfig = Static<typeof RawConfig>;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Config {}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseRawConfig(_raw: RawConfig): Config {
  return {};
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
