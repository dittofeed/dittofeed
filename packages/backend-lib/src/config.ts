import { Static, Type } from "@sinclair/typebox";
import { URL } from "url";
import { inspect } from "util";
import { Overwrite } from "utility-types";

import { loadConfig, NodeEnvEnum, setConfigOnEnv } from "./config/loader";
import { KafkaSaslMechanism, WriteMode } from "./types";

const BoolStr = Type.Union([Type.Literal("true"), Type.Literal("false")]);

const BaseRawConfigProps = {
  databaseUrl: Type.Optional(Type.String()),
  databaseUser: Type.Optional(Type.String()),
  databasePassword: Type.Optional(Type.String()),
  databaseHost: Type.Optional(Type.String()),
  databasePort: Type.Optional(Type.String()),
  writeMode: Type.Optional(WriteMode),
  temporalAddress: Type.Optional(Type.String()),
  clickhouseHost: Type.String(),
  clickhouseDatabase: Type.Optional(Type.String()),
  clickhouseUser: Type.String(),
  clickhousePassword: Type.String(),
  kafkaBrokers: Type.String(),
  kafkaUsername: Type.Optional(Type.String()),
  kafkaPassword: Type.Optional(Type.String()),
  kafkaSsl: Type.Optional(BoolStr),
  kafkaSaslMechanism: Type.Optional(KafkaSaslMechanism),
  kafkaUserEventsPartitions: Type.Optional(Type.String()),
  kafkaUserEventsReplicationFactor: Type.Optional(Type.String()),
  userEventsTopicName: Type.Optional(Type.String()),
  temporalNamespace: Type.Optional(Type.String()),
  logConfig: Type.Optional(BoolStr),
  bootstrapEvents: Type.Optional(BoolStr),
  bootstrapWorker: Type.Optional(BoolStr),
  defaultWorkspaceId: Type.Optional(Type.String()),
  defaultIdUserPropertyId: Type.Optional(Type.String()),
  defaultAnonymousIdIdUserPropertyId: Type.Optional(Type.String()),
  defaultEmailUserPropertyId: Type.Optional(Type.String()),
  defaultPhoneUserPropertyId: Type.Optional(Type.String()),
  defaultFirstNameUserPropertyId: Type.Optional(Type.String()),
  defaultLastNameUserPropertyId: Type.Optional(Type.String()),
  defaultLanguageUserPropertyId: Type.Optional(Type.String()),
  defaultAccountManagerUserPropertyId: Type.Optional(Type.String()),
  defaultUserEventsTableVersion: Type.Optional(Type.String()),
  otelCollector: Type.Optional(Type.String()),
};

const BaseRawConfig = Type.Object(BaseRawConfigProps);

function inspectConfig(u: unknown) {
  console.log(
    `Initialized with config:\n${inspect(u, {
      colors: true,
      depth: null,
      sorted: true,
    })}`
  );
}

// Structure of application config.
const RawConfig = Type.Union([
  Type.Intersect([
    Type.Object({
      nodeEnv: Type.Literal(NodeEnvEnum.Production),
    }),
    BaseRawConfig,
  ]),
  Type.Intersect([
    Type.Object({
      nodeEnv: Type.Optional(
        Type.Union([
          Type.Literal(NodeEnvEnum.Development),
          Type.Literal(NodeEnvEnum.Test),
        ])
      ),
    }),
    Type.Partial(BaseRawConfig),
  ]),
]);

type RawConfig = Static<typeof RawConfig>;

export type Config = Overwrite<
  RawConfig,
  {
    kafkaBrokers: string[];
    computedPropertiesTopicName: string;
    userEventsTopicName: string;
    temporalNamespace: string;
    databaseUrl: string;
    clickhouseHost: string;
    clickhouseDatabase: string;
    kafkaSsl: boolean;
    nodeEnv: NodeEnvEnum;
    temporalAddress: string;
    logConfig: boolean;
    bootstrapEvents: boolean;
    kafkaUserEventsPartitions: number;
    kafkaUserEventsReplicationFactor: number;
    kafkaSaslMechanism: KafkaSaslMechanism;
    bootstrapWorker: boolean;
    writeMode: WriteMode;
  }
> & {
  defaultWorkspaceId: string;
  defaultUserEventsTableVersion: string;
};

const defaultDbParams: Record<string, string> = {
  connect_timeout: "60",
};

function parseDatabaseUrl(rawConfig: RawConfig) {
  if (rawConfig.databaseUrl) {
    const url = new URL(rawConfig.databaseUrl);

    url.search = new URLSearchParams({
      ...defaultDbParams,
      ...Object.fromEntries(url.searchParams),
    }).toString();
    return url.toString();
  }

  if (
    rawConfig.databaseUser &&
    rawConfig.databasePassword &&
    rawConfig.databaseHost &&
    rawConfig.databasePort
  ) {
    const url = new URL(
      `postgresql://${rawConfig.databaseUser}:${rawConfig.databasePassword}@${rawConfig.databaseHost}:${rawConfig.databasePort}/dittofeed`
    );
    url.search = new URLSearchParams({
      ...defaultDbParams,
    }).toString();

    return url.toString();
  }

  if (rawConfig.nodeEnv === "production") {
    throw new Error(
      "In production must either specify databaseUrl or all of databaseUser, databasePassword, databaseHost, databasePort"
    );
  }

  const url = new URL(
    "postgresql://postgres:password@localhost:5432/dittofeed"
  );
  url.search = new URLSearchParams({
    ...defaultDbParams,
  }).toString();

  return url.toString();
}

function parseToNumber({
  nodeEnv,
  unparsed,
  prodDefault,
  nonProdDefault,
}: {
  nodeEnv: NodeEnvEnum;
  unparsed?: string;
  prodDefault: number;
  nonProdDefault: number;
}) {
  const coerced = Number(unparsed);
  if (Number.isNaN(coerced)) {
    if (nodeEnv === NodeEnvEnum.Production) {
      return prodDefault;
    }
    return nonProdDefault;
  }
  return coerced;
}

function parseRawConfig(rawConfig: RawConfig): Config {
  const databaseUrl = parseDatabaseUrl(rawConfig);
  const clickhouseDatabase =
    rawConfig.clickhouseDatabase ??
    (rawConfig.nodeEnv === "test" ? "dittofeed_test" : "dittofeed");

  const nodeEnv = rawConfig.nodeEnv ?? NodeEnvEnum.Development;
  const writeMode: WriteMode =
    rawConfig.writeMode ??
    (rawConfig.nodeEnv === "test" ? "ch-sync" : "ch-async");

  const parsedConfig: Config = {
    ...rawConfig,
    nodeEnv,
    writeMode,
    temporalAddress: rawConfig.temporalAddress ?? "localhost:7233",
    databaseUrl,
    clickhouseDatabase,
    clickhouseHost: rawConfig.clickhouseHost ?? "http://localhost:8123",
    clickhouseUser: rawConfig.clickhouseUser ?? "dittofeed",
    clickhousePassword: rawConfig.clickhousePassword ?? "password",
    kafkaBrokers: rawConfig.kafkaBrokers
      ? rawConfig.kafkaBrokers.split(",")
      : ["localhost:9092"],
    kafkaSsl: rawConfig.kafkaSsl === "true",
    kafkaSaslMechanism: rawConfig.kafkaSaslMechanism ?? "plain",
    kafkaUserEventsPartitions: parseToNumber({
      unparsed: rawConfig.kafkaUserEventsPartitions,
      nodeEnv,
      prodDefault: 10,
      nonProdDefault: 1,
    }),
    kafkaUserEventsReplicationFactor: parseToNumber({
      unparsed: rawConfig.kafkaUserEventsReplicationFactor,
      nodeEnv,
      prodDefault: 3,
      nonProdDefault: 1,
    }),
    userEventsTopicName:
      rawConfig.userEventsTopicName ?? "dittofeed-user-events",
    temporalNamespace: rawConfig.temporalNamespace ?? "default",
    defaultWorkspaceId:
      rawConfig.defaultWorkspaceId ?? "024f3d0a-8eee-11ed-a1eb-0242ac120002",
    // UUID with _ instead of - for clickhouse compatibility
    defaultUserEventsTableVersion:
      rawConfig.defaultUserEventsTableVersion ??
      "48221d18_bd04_4c6b_abf3_9d0a4f87f52f",
    logConfig: rawConfig.logConfig === "true",
    bootstrapEvents: rawConfig.bootstrapEvents === "true",
    bootstrapWorker:
      rawConfig.bootstrapWorker === "true" ||
      (nodeEnv === NodeEnvEnum.Production &&
        rawConfig.bootstrapWorker !== "false"),
  };
  return parsedConfig;
}

// Singleton configuration object used by application.
let CONFIG: Config | null = null;

export default function config(): Config {
  if (!CONFIG) {
    CONFIG = loadConfig({
      schema: RawConfig,
      transform: parseRawConfig,
      keys: ["nodeEnv"].concat(Object.keys(BaseRawConfigProps)),
    });
    setConfigOnEnv(CONFIG);

    if (CONFIG.logConfig) {
      console.log(`Initialized with config:\n${inspectConfig(CONFIG)}`);
    }
  }
  return CONFIG;
}
