import { Static, Type } from "@sinclair/typebox";
import { loadConfig, setConfigOnEnv } from "backend-lib/src/config/loader";
import { BoolStr } from "backend-lib/src/types";
import { parseInt } from "isomorphic-lib/src/numbers";
import { Overwrite } from "utility-types";

// Structure of application config.
const RawConfig = Type.Object(
  {
    workerServiceName: Type.Optional(Type.String()),
    reuseContext: Type.Optional(BoolStr),
    useTemporalVersioning: Type.Optional(BoolStr),
    taskQueue: Type.Optional(Type.String()),
    maxCachedWorkflows: Type.Optional(Type.String({ format: "naturalNumber" })),
    maxConcurrentWorkflowTaskExecutions: Type.Optional(
      Type.String({ format: "naturalNumber" }),
    ),
    maxConcurrentActivityTaskPolls: Type.Optional(
      Type.String({ format: "naturalNumber" }),
    ),
    maxConcurrentWorkflowTaskPolls: Type.Optional(
      Type.String({ format: "naturalNumber" }),
    ),
  },
  { additionalProperties: false },
);

type RawConfig = Static<typeof RawConfig>;

type Config = Overwrite<
  RawConfig,
  {
    workerServiceName: string;
    reuseContext: boolean;
    useTemporalVersioning: boolean;
    maxCachedWorkflows?: number;
    taskQueue: string;
    maxConcurrentWorkflowTaskExecutions?: number;
    maxConcurrentActivityTaskPolls?: number;
    maxConcurrentWorkflowTaskPolls?: number;
  }
>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseRawConfig(raw: RawConfig): Config {
  let maxCachedWorkflows: number | undefined;
  if (raw.maxCachedWorkflows) {
    if (raw.maxCachedWorkflows.toLowerCase() !== "none") {
      maxCachedWorkflows = parseInt(raw.maxCachedWorkflows);
    }
  } else {
    maxCachedWorkflows = 50;
  }
  return {
    ...raw,
    reuseContext: raw.reuseContext !== "false",
    useTemporalVersioning: raw.useTemporalVersioning === "true",
    workerServiceName: raw.workerServiceName ?? "dittofeed-worker",
    taskQueue: raw.taskQueue ?? "default",
    maxCachedWorkflows,
    maxConcurrentWorkflowTaskExecutions: raw.maxConcurrentWorkflowTaskExecutions
      ? parseInt(raw.maxConcurrentWorkflowTaskExecutions)
      : undefined,
    maxConcurrentActivityTaskPolls: raw.maxConcurrentActivityTaskPolls
      ? parseInt(raw.maxConcurrentActivityTaskPolls)
      : undefined,
    maxConcurrentWorkflowTaskPolls: raw.maxConcurrentWorkflowTaskPolls
      ? parseInt(raw.maxConcurrentWorkflowTaskPolls)
      : undefined,
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
