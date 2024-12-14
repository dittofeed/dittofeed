import { Static, Type } from "@sinclair/typebox";
import { loadConfig, setConfigOnEnv } from "backend-lib/src/config/loader";
import { BoolStr } from "backend-lib/src/types";
import { Overwrite } from "utility-types";

// Structure of application config.
const RawConfig = Type.Object(
  {
    workerServiceName: Type.Optional(Type.String()),
    reuseContext: Type.Optional(BoolStr),
    maxCachedWorkflows: Type.Optional(Type.String({ format: "naturalNumber" })),
    taskQueue: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type RawConfig = Static<typeof RawConfig>;

type Config = Overwrite<
  RawConfig,
  {
    workerServiceName: string;
    reuseContext: boolean;
    maxCachedWorkflows?: number;
    taskQueue: string;
  }
>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseRawConfig(raw: RawConfig): Config {
  return {
    ...raw,
    reuseContext: raw.reuseContext === "true",
    workerServiceName: raw.workerServiceName ?? "dittofeed-worker",
    maxCachedWorkflows: raw.maxCachedWorkflows
      ? parseInt(raw.maxCachedWorkflows, 10)
      : undefined,
    taskQueue: raw.taskQueue ?? "default",
  };
}

// Singleton configuration object used by application.
let CONFIG: Config | null = null;

export default function config(): Config {
  if (!CONFIG) {
    CONFIG = loadConfig({
      schema: RawConfig,
      transform: parseRawConfig,
      keys: Object.keys(RawConfig.properties),
    });
    setConfigOnEnv(CONFIG);
  }
  return CONFIG;
}
