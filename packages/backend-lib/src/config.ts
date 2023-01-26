import { Static, Type } from "@sinclair/typebox";
import { constantCase } from "change-case";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { Overwrite } from "utility-types";

enum NodeEnv {
  Development = "development",
  Test = "test",
  Production = "production",
}

const NodeEnvEnum = Type.Enum(NodeEnv);

// Structure of application config.
const RawConfig = Type.Object(
  {
    nodeEnv: Type.Optional(NodeEnvEnum),
    databaseUrl: Type.Optional(Type.String()),
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
    nodeEnv: NodeEnv;
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
  }
>;

type UnknownConfig = Record<string, unknown>;

function parseRawConfig(rawConfig: RawConfig): Config {
  const parsedConfig: Config = {
    ...rawConfig,
    nodeEnv: rawConfig.nodeEnv ?? NodeEnv.Development,
    databaseUrl: "postgresql://postgres:password@localhost:5432/dittofeed",
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
    defaultUserEventsTableVersion:
      rawConfig.defaultUserEventsTableVersion ??
      "48221d18-bd04-4c6b-abf3-9d0a4f87f52f",
  };
  return parsedConfig;
}

function setConfigOnEnv(configForEnv: Config): Config {
  for (const [key, value] of Object.entries(configForEnv)) {
    const serializedValue = Array.isArray(value) ? value.join(",") : value;
    const casedKey = constantCase(key);
    process.env[casedKey] = serializedValue;
  }
  return configForEnv;
}

export function initializeConfig(): Config {
  const unknownConfig: UnknownConfig = {};

  for (const key of Object.keys(RawConfig.properties)) {
    unknownConfig[key] = process.env[constantCase(key)];
  }

  const rawConfig = unwrap(schemaValidate(unknownConfig, RawConfig));

  return parseRawConfig(rawConfig);
}

// Singleton configuration object used by application.
let CONFIG: Config | null = null;

export default function config(): Config {
  if (!CONFIG) {
    CONFIG = initializeConfig();
    setConfigOnEnv(CONFIG);
  }
  return CONFIG;
}
