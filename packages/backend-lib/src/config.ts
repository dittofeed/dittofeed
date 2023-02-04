import { Static, Type } from "@sinclair/typebox";
import { inspect } from "util";
import { Overwrite } from "utility-types";

import {
  loadConfig,
  NodeEnv,
  NodeEnvEnum,
  setConfigOnEnv,
} from "./config/loader";

const BoolStr = Type.Union([Type.Literal("true"), Type.Literal("false")]);

// Structure of application config.
const RawConfig = Type.Object(
  {
    nodeEnv: Type.Optional(NodeEnv),
    databaseUrl: Type.Optional(Type.String()),
    databaseUser: Type.Optional(Type.String()),
    databasePassword: Type.Optional(Type.String()),
    databaseHost: Type.Optional(Type.String()),
    databasePort: Type.Optional(Type.String()),
    temporalAddress: Type.Optional(Type.String()),
    clickhouseHost: Type.Optional(Type.String()),
    clickhouseDatabase: Type.Optional(Type.String()),
    clickhouseUsername: Type.Optional(Type.String()),
    clickhousePassword: Type.Optional(Type.String()),
    kafkaBrokers: Type.Optional(Type.String()),
    computedPropertiesTopicName: Type.Optional(Type.String()),
    userEventsTopicName: Type.Optional(Type.String()),
    temporalNamespace: Type.Optional(Type.String()),
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
    logConfig: Type.Optional(BoolStr),
  },
  { additionalProperties: false }
);

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
    nodeEnv: NodeEnvEnum;
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
    temporalAddress: string;
    logConfig: boolean;
  }
>;

function parseDatabaseUrl(rawConfig: RawConfig) {
  if (rawConfig.databaseUrl) {
    return rawConfig.databaseUrl;
  }

  if (
    rawConfig.databaseUser &&
    rawConfig.databasePassword &&
    rawConfig.databaseHost &&
    rawConfig.databasePort
  ) {
    return `postgresql://${rawConfig.databaseUser}:${rawConfig.databasePassword}@${rawConfig.databaseHost}:${rawConfig.databasePort}/dittofeed`;
  }

  return "postgresql://postgres:password@localhost:5432/dittofeed";
}

function parseRawConfig(rawConfig: RawConfig): Config {
  const databaseUrl = parseDatabaseUrl(rawConfig);

  const parsedConfig: Config = {
    ...rawConfig,
    nodeEnv: rawConfig.nodeEnv ?? NodeEnvEnum.Development,
    temporalAddress: rawConfig.temporalAddress ?? "localhost:7233",
    databaseUrl,
    clickhouseDatabase: rawConfig.clickhouseDatabase ?? "dittofeed",
    clickhouseHost: rawConfig.clickhouseHost ?? "http://localhost:8123",
    kafkaBrokers: rawConfig.kafkaBrokers
      ? rawConfig.kafkaBrokers.split(",")
      : ["localhost:9092"],
    computedPropertiesTopicName:
      rawConfig.computedPropertiesTopicName ?? "dittofeed-computed-properties",
    userEventsTopicName:
      rawConfig.userEventsTopicName ?? "dittofeed-user-events",
    temporalNamespace:
      rawConfig.temporalNamespace ??
      (rawConfig.nodeEnv === "test" ? "default" : "dittofeed"),
    defaultWorkspaceId:
      rawConfig.defaultWorkspaceId ?? "024f3d0a-8eee-11ed-a1eb-0242ac120002",
    defaultIdUserPropertyId:
      rawConfig.defaultIdUserPropertyId ??
      "eaeafca1-a8ec-49df-8359-43fef17a9794",
    defaultAnonymousIdIdUserPropertyId:
      rawConfig.defaultAnonymousIdIdUserPropertyId ??
      "ad4c926b-dcae-4da4-b779-6e23061e6e17",
    defaultEmailUserPropertyId:
      rawConfig.defaultEmailUserPropertyId ??
      "7e45987c-4a2c-42ef-867e-0a1e1e8a3a56",
    defaultPhoneUserPropertyId:
      rawConfig.defaultPhoneUserPropertyId ??
      "462f651a-9c51-4658-9b65-67234280cedd",
    defaultFirstNameUserPropertyId:
      rawConfig.defaultFirstNameUserPropertyId ??
      "352889dc-696b-42eb-a54a-9baa5fc62b18",
    defaultLastNameUserPropertyId:
      rawConfig.defaultLastNameUserPropertyId ??
      "6f390a01-52cc-4308-be9e-ecabd5474a93",
    defaultLanguageUserPropertyId:
      rawConfig.defaultLanguageUserPropertyId ??
      "6e0c65eb-3792-414b-9d56-fd7828b71ebe",
    defaultAccountManagerUserPropertyId:
      rawConfig.defaultAccountManagerUserPropertyId ??
      "6e0c65eb-3792-414b-9d56-fd7828b71ebe",
    // UUID with _ instead of - for clickhouse compatibility
    defaultUserEventsTableVersion:
      rawConfig.defaultUserEventsTableVersion ??
      "48221d18_bd04_4c6b_abf3_9d0a4f87f52f",
    logConfig: rawConfig.logConfig === "true",
  };
  return parsedConfig;
}

// Singleton configuration object used by application.
let CONFIG: Config | null = null;

export default function config(): Config {
  if (!CONFIG) {
    CONFIG = loadConfig({ schema: RawConfig, transform: parseRawConfig });
    setConfigOnEnv(CONFIG);

    if (CONFIG.logConfig) {
      console.log(
        `Initialized with config:\n${inspect(CONFIG, {
          colors: true,
          depth: null,
          sorted: true,
        })}`
      );
    }
  }
  return CONFIG;
}
