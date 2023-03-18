import { Static, Type } from "@sinclair/typebox";
import { loadConfig, setConfigOnEnv } from "backend-lib/src/config/loader";
import { Overwrite } from "utility-types";

// Structure of application config.
const RawConfig = Type.Object(
  {
    workerServiceName: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);

type RawConfig = Static<typeof RawConfig>;

type Config = Overwrite<
  RawConfig,
  {
    workerServiceName: string;
  }
>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseRawConfig(raw: RawConfig): Config {
  return {
    ...raw,
    workerServiceName: raw.workerServiceName ?? "dittofeed-worker",
  };
}

// Singleton configuration object used by application.
let CONFIG: Config | null = null;

export default function config(): Config {
  if (!CONFIG) {
    CONFIG = loadConfig({
      schema: RawConfig,
      transform: parseRawConfig,
      keys: [],
    });
    setConfigOnEnv(CONFIG);
  }
  return CONFIG;
}
