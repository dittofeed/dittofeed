import { Static, Type } from "@sinclair/typebox";
import { URL } from "url";
import { inspect } from "util";
import { Overwrite } from "utility-types";

import { loadConfig, NodeEnvEnum, setConfigOnEnv } from "./config/loader";

const BoolStr = Type.Union([Type.Literal("true"), Type.Literal("false")]);

const BaseRawConfigProps = {
  databaseUrl: Type.Optional(Type.String()),
  databaseUser: Type.Optional(Type.String()),
  databasePassword: Type.Optional(Type.String()),
  databaseHost: Type.Optional(Type.String()),
  databasePort: Type.Optional(Type.String()),
  temporalAddress: Type.Optional(Type.String()),
  clickhouseHost: Type.String(),
  clickhouseDatabase: Type.Optional(Type.String()),
  clickhouseUser: Type.String(),
  clickhousePassword: Type.String(),
  kafkaBrokers: Type.String(),
  kafkaUsername: Type.Optional(Type.String()),
  kafkaPassword: Type.Optional(Type.String()),
  kafkaSsl: Type.Optional(BoolStr),
  kafkaUserEventsPartitions: Type.Optional(Type.String()),
  kafkaUserEventsReplicationFactor: Type.Optional(Type.String()),
  userEventsTopicName: Type.Optional(Type.String()),
  temporalNamespace: Type.Optional(Type.String()),
  logConfig: Type.Optional(BoolStr),
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
    kafkaUsername: string;
    kafkaPassword: string;
    kafkaSsl: boolean;
    nodeEnv: NodeEnvEnum;
    temporalAddress: string;
    logConfig: boolean;
    kafkaUserEventsPartitions: number;
    kafkaUserEventsReplicationFactor: number;
  }
> & {
  defaultWorkspaceId: string;
  defaultIdUserPropertyId: string;
  defaultAnonymousIdIdUserPropertyId: string;
  defaultEmailUserPropertyId: string;
  defaultPhoneUserPropertyId: string;
  defaultFirstNameUserPropertyId: string;
  defaultLastNameUserPropertyId: string;
  defaultLanguageUserPropertyId: string;
  defaultAccountManagerUserPropertyId: string;
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

  const parsedConfig: Config = {
    ...rawConfig,
    nodeEnv,
    temporalAddress: rawConfig.temporalAddress ?? "localhost:7233",
    databaseUrl,
    clickhouseDatabase,
    clickhouseHost: rawConfig.clickhouseHost ?? "http://localhost:8123",
    clickhouseUser: rawConfig.clickhouseUser ?? "dittofeed",
    clickhousePassword: rawConfig.clickhousePassword ?? "password",
    kafkaBrokers: rawConfig.kafkaBrokers
      ? rawConfig.kafkaBrokers.split(",")
      : ["localhost:9092"],
    kafkaUsername: rawConfig.kafkaUsername ?? "dittofeed",
    kafkaPassword: rawConfig.kafkaPassword ?? "password",
    kafkaSsl: rawConfig.kafkaSsl === "true",
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
    defaultWorkspaceId: "024f3d0a-8eee-11ed-a1eb-0242ac120002",
    defaultIdUserPropertyId: "eaeafca1-a8ec-49df-8359-43fef17a9794",
    defaultAnonymousIdIdUserPropertyId: "ad4c926b-dcae-4da4-b779-6e23061e6e17",
    defaultEmailUserPropertyId: "7e45987c-4a2c-42ef-867e-0a1e1e8a3a56",
    defaultPhoneUserPropertyId: "462f651a-9c51-4658-9b65-67234280cedd",
    defaultFirstNameUserPropertyId: "352889dc-696b-42eb-a54a-9baa5fc62b18",
    defaultLastNameUserPropertyId: "6f390a01-52cc-4308-be9e-ecabd5474a93",
    defaultLanguageUserPropertyId: "6e0c65eb-3792-414b-9d56-fd7828b71ebe",
    defaultAccountManagerUserPropertyId: "6e0c65eb-3792-414b-9d56-fd7828b71ebe",
    // UUID with _ instead of - for clickhouse compatibility
    defaultUserEventsTableVersion: "48221d18_bd04_4c6b_abf3_9d0a4f87f52f",
    logConfig: rawConfig.logConfig === "true",
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
