import { Static, Type } from "@sinclair/typebox";
import { parseInt } from "isomorphic-lib/src/numbers";
import { hasProtocol } from "isomorphic-lib/src/urls";
import queryString from "querystring";
import { URL } from "url";
import { Overwrite } from "utility-types";

import { loadConfig, setConfigOnEnv } from "./config/loader";
import {
  AuthMode,
  BoolStr,
  KafkaSaslMechanism,
  LogLevel,
  NodeEnvEnum,
  SourceControlProvider,
  WriteMode,
} from "./types";

const BaseRawConfigProps = {
  databaseUrl: Type.Optional(Type.String()),
  databaseUser: Type.Optional(Type.String()),
  databasePassword: Type.Optional(Type.String()),
  databaseHost: Type.Optional(Type.String()),
  databasePort: Type.Optional(Type.String()),
  databaseParams: Type.Optional(Type.String()),
  databaseName: Type.Optional(Type.String()),
  writeMode: Type.Optional(WriteMode),
  temporalAddress: Type.Optional(Type.String()),
  clickhouseHost: Type.String(),
  clickhouseProtocol: Type.Optional(Type.String()),
  clickhouseDatabase: Type.Optional(Type.String()),
  clickhouseUser: Type.String(),
  clickhousePassword: Type.String(),
  kafkaBrokers: Type.Optional(Type.String()),
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
  bootstrapSafe: Type.Optional(BoolStr),
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
  startOtel: Type.Optional(BoolStr),
  prettyLogs: Type.Optional(BoolStr),
  logLevel: Type.Optional(LogLevel),
  googleOps: Type.Optional(BoolStr),
  enableSourceControl: Type.Optional(BoolStr),
  sourceControlProvider: Type.Optional(SourceControlProvider),
  oidcTokenPublicKey: Type.Optional(Type.String()),
  authMode: Type.Optional(AuthMode),
  authProvider: Type.Optional(Type.String()),
  oauthStartUrl: Type.Optional(Type.String()),
  signoutUrl: Type.Optional(Type.String()),
  signoutRedirectUrl: Type.Optional(Type.String()),
  trackDashboard: Type.Optional(BoolStr),
  dashboardWriteKey: Type.Optional(Type.String()),
  dashboardUrl: Type.Optional(
    Type.String({
      description:
        "This is a poorly named configuration option. It configures the base domain for the API and dashboard.",
    }),
  ),
  dashboardUrlName: Type.Optional(Type.String()),
  enableMobilePush: Type.Optional(BoolStr),
  hubspotClientId: Type.Optional(Type.String()),
  hubspotClientSecret: Type.Optional(Type.String()),
  readQueryPageSize: Type.Optional(Type.String({ format: "naturalNumber" })),
  readQueryConcurrency: Type.Optional(Type.String({ format: "naturalNumber" })),
  computePropertiesInterval: Type.Optional(
    Type.String({ format: "naturalNumber" }),
  ),
  computePropertiesAttempts: Type.Optional(
    Type.String({ format: "naturalNumber" }),
  ),
  secretKey: Type.Optional(Type.String()),
  password: Type.Optional(Type.String()),
  computePropertiesWorkflowTaskTimeout: Type.Optional(
    Type.String({ format: "naturalNumber" }),
  ),
  sessionCookieSecure: Type.Optional(BoolStr),
  openIdClientId: Type.Optional(Type.String()),
  openIdClientSecret: Type.Optional(Type.String()),
  allowedOrigins: Type.Optional(Type.String()),
  blobStorageEndpoint: Type.Optional(Type.String()),
  blobStorageAccessKeyId: Type.Optional(Type.String()),
  blobStorageSecretAccessKey: Type.Optional(Type.String()),
  blobStorageBucket: Type.Optional(Type.String()),
  enableBlobStorage: Type.Optional(BoolStr),
  blobStorageRegion: Type.Optional(Type.String()),
  exportLogsHyperDx: Type.Optional(BoolStr),
  hyperDxApiKey: Type.Optional(Type.String()),
  dittofeedTelemetryDisabled: Type.Optional(BoolStr),
  appVersion: Type.Optional(Type.String()),
  onboardingUrl: Type.Optional(Type.String()),
};

function defaultTemporalAddress(inputURL?: string): string {
  if (!inputURL) {
    return "localhost:7233";
  }
  const parts = inputURL.split(":");
  if (parts.length === 1) {
    return `${parts[0] ?? ""}:7233`;
  }
  return inputURL;
}

function defaultChUrl(inputURL?: string, protocolOverride?: string): string {
  if (!inputURL) {
    return "http://localhost:8123";
  }
  let urlToParse: string = inputURL;

  // Prepend a default protocol if the input doesn't seem to have one
  if (!hasProtocol(inputURL)) {
    const protocol = protocolOverride ?? "http";
    urlToParse = `${protocol}://${inputURL}`;
  }

  const parsedURL = new URL(urlToParse);

  // Check if the URL has a domain
  if (!parsedURL.hostname) {
    throw new Error("URL must have a domain");
  }

  // Default the port to '8123' if not present
  if (!parsedURL.port) {
    parsedURL.port = "8123";
  }

  // Convert the URL object back to a string
  const newURL = parsedURL.toString();

  return newURL;
}

// Structure of application config.
const RawConfig = Type.Union([
  Type.Object({
    nodeEnv: Type.Literal(NodeEnvEnum.Production),
    ...BaseRawConfigProps,
  }),
  Type.Partial(
    Type.Object({
      nodeEnv: Type.Union([
        Type.Literal(NodeEnvEnum.Development),
        Type.Literal(NodeEnvEnum.Test),
      ]),
      ...BaseRawConfigProps,
    }),
  ),
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
    otelCollector: string;
    startOtel: boolean;
    logLevel: LogLevel;
    prettyLogs: boolean;
    googleOps: boolean;
    enableSourceControl: boolean;
    authMode: AuthMode;
    trackDashboard: boolean;
    dashboardUrl: string;
    enableMobilePush: boolean;
    readQueryPageSize: number;
    computePropertiesInterval: number;
    computePropertiesWorkflowTaskTimeout: number;
    computePropertiesAttempts: number;
    sessionCookieSecure: boolean;
    signoutRedirectUrl: string;
    allowedOrigins: string[];
    enableBlobStorage: boolean;
    blobStorageEndpoint: string;
    blobStorageAccessKeyId: string;
    blobStorageSecretAccessKey: string;
    blobStorageBucket: string;
    blobStorageRegion: string;
    readQueryConcurrency: number;
    exportLogsHyperDx: boolean;
    dittofeedTelemetryDisabled: boolean;
    onboardingUrl: string;
    bootstrapSafe: boolean;
  }
> & {
  defaultUserEventsTableVersion: string;
  database: string;
};

const defaultDbParams: Record<string, string> = {
  connect_timeout: "60",
};

export const DEFAULT_BACKEND_CONFIG = {
  databasePassword: "password",
  clickhousePassword: "password",
  password: "password",
  secretKey: "o/UopmFUqiYriIzOCXnzZXGbcYTWuE3iVx2822jC0fY=",
} as const;

function parseDatabaseUrl(rawConfig: RawConfig, database: string) {
  if (rawConfig.databaseUrl) {
    const url = new URL(rawConfig.databaseUrl);

    url.search = new URLSearchParams({
      ...defaultDbParams,
      ...Object.fromEntries(url.searchParams),
    }).toString();
    return url.toString();
  }

  if (
    rawConfig.nodeEnv === NodeEnvEnum.Production &&
    !(rawConfig.databaseUser && rawConfig.databasePassword)
  ) {
    throw new Error("In production must provide database credentials");
  }

  const databaseUser = rawConfig.databaseUser ?? "postgres";
  const databasePassword =
    rawConfig.databasePassword ?? DEFAULT_BACKEND_CONFIG.databasePassword;
  const databaseHost = rawConfig.databaseHost ?? "localhost";
  const databasePort = rawConfig.databasePort ?? "5432";
  const url = new URL(
    `postgresql://${databaseUser}:${databasePassword}@${databaseHost}:${databasePort}/${database}`,
  );
  const unfilteredParams = rawConfig.databaseParams
    ? queryString.parse(rawConfig.databaseParams)
    : null;
  const paramOverrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(unfilteredParams ?? {})) {
    if (typeof value === "string") {
      paramOverrides[key] = value;
    }
  }
  const params = {
    ...defaultDbParams,
    ...paramOverrides,
  };
  url.search = new URLSearchParams(params).toString();

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

function buildDashboardUrl({
  nodeEnv,
  dashboardUrl,
  dashboardUrlName,
}: {
  nodeEnv: NodeEnvEnum;
  dashboardUrl?: string;
  dashboardUrlName?: string;
}): string {
  const specifiedDashboardUrl =
    dashboardUrlName && process.env[dashboardUrlName]
      ? process.env[dashboardUrlName]
      : dashboardUrl;
  if (specifiedDashboardUrl) {
    return specifiedDashboardUrl;
  }
  return nodeEnv === NodeEnvEnum.Development || nodeEnv === NodeEnvEnum.Test
    ? "http://localhost:3000"
    : "https://app.dittofeed.com";
}

function parseRawConfig(rawConfig: RawConfig): Config {
  const clickhouseDatabase =
    rawConfig.clickhouseDatabase ??
    (rawConfig.nodeEnv === NodeEnvEnum.Test ? "dittofeed_test" : "dittofeed");

  const database =
    rawConfig.databaseName ??
    (rawConfig.nodeEnv === NodeEnvEnum.Test ? "dittofeed_test" : "dittofeed");

  const databaseUrl = parseDatabaseUrl(rawConfig, database);
  const nodeEnv = rawConfig.nodeEnv ?? NodeEnvEnum.Development;
  const writeMode: WriteMode =
    rawConfig.writeMode ??
    (rawConfig.nodeEnv === NodeEnvEnum.Test ? "ch-sync" : "ch-async");

  let logLevel: LogLevel;
  if (rawConfig.logLevel) {
    logLevel = rawConfig.logLevel;
  } else {
    switch (nodeEnv) {
      case NodeEnvEnum.Production:
        logLevel = "info";
        break;
      case NodeEnvEnum.Development:
        logLevel = "debug";
        break;
      case NodeEnvEnum.Test:
        logLevel = "error";
    }
  }

  const authMode = rawConfig.authMode ?? "anonymous";
  const secretKey = rawConfig.secretKey ?? DEFAULT_BACKEND_CONFIG.secretKey;
  const dashboardUrl = buildDashboardUrl({
    nodeEnv,
    dashboardUrl: rawConfig.dashboardUrl,
    dashboardUrlName: rawConfig.dashboardUrlName,
  });

  const parsedConfig: Config = {
    ...rawConfig,
    nodeEnv,
    writeMode,
    temporalAddress: defaultTemporalAddress(rawConfig.temporalAddress),
    databaseUrl,
    database,
    clickhouseDatabase,
    clickhouseHost: defaultChUrl(
      rawConfig.clickhouseHost,
      rawConfig.clickhouseProtocol,
    ),
    clickhouseUser: rawConfig.clickhouseUser ?? "dittofeed",
    clickhousePassword:
      rawConfig.clickhousePassword ?? DEFAULT_BACKEND_CONFIG.clickhousePassword,
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
    // deprecated
    defaultUserEventsTableVersion:
      rawConfig.defaultUserEventsTableVersion ?? "",
    logConfig: rawConfig.logConfig === "true",
    bootstrapEvents: rawConfig.bootstrapEvents === "true",
    bootstrapWorker:
      rawConfig.bootstrapWorker === "true" ||
      (nodeEnv === NodeEnvEnum.Production &&
        rawConfig.bootstrapWorker !== "false"),
    bootstrapSafe: rawConfig.bootstrapSafe === "true",
    startOtel: rawConfig.startOtel === "true",
    googleOps: rawConfig.googleOps === "true",
    otelCollector: rawConfig.otelCollector ?? "http://localhost:4317",
    prettyLogs:
      rawConfig.prettyLogs === "true" ||
      ((nodeEnv === NodeEnvEnum.Development || nodeEnv === NodeEnvEnum.Test) &&
        rawConfig.prettyLogs !== "false"),
    logLevel,
    enableSourceControl: rawConfig.enableSourceControl === "true",
    authMode,
    dashboardUrl,
    trackDashboard: rawConfig.trackDashboard === "true",
    enableMobilePush: rawConfig.enableMobilePush === "true",
    readQueryPageSize: rawConfig.readQueryPageSize
      ? parseInt(rawConfig.readQueryPageSize)
      : 1000,
    readQueryConcurrency: rawConfig.readQueryConcurrency
      ? parseInt(rawConfig.readQueryConcurrency)
      : 10,
    // 2 minutes in ms
    computePropertiesInterval: rawConfig.computePropertiesInterval
      ? parseInt(rawConfig.computePropertiesInterval)
      : 120 * 1000,
    signoutUrl:
      authMode === "single-tenant"
        ? "/api/public/single-tenant/signout"
        : rawConfig.signoutUrl,
    signoutRedirectUrl: rawConfig.signoutRedirectUrl ?? dashboardUrl,
    secretKey,
    password: rawConfig.password ?? DEFAULT_BACKEND_CONFIG.password,
    // ms
    computePropertiesWorkflowTaskTimeout:
      rawConfig.computePropertiesWorkflowTaskTimeout
        ? parseInt(rawConfig.computePropertiesWorkflowTaskTimeout)
        : 10000,
    computePropertiesAttempts: rawConfig.computePropertiesAttempts
      ? parseInt(rawConfig.computePropertiesAttempts)
      : 150,
    sessionCookieSecure: rawConfig.sessionCookieSecure === "true",
    allowedOrigins: (rawConfig.allowedOrigins ?? dashboardUrl).split(","),
    enableBlobStorage: rawConfig.enableBlobStorage === "true",
    blobStorageEndpoint:
      rawConfig.blobStorageEndpoint ?? "http://localhost:9010",
    blobStorageAccessKeyId: rawConfig.blobStorageAccessKeyId ?? "admin",
    blobStorageSecretAccessKey:
      rawConfig.blobStorageSecretAccessKey ?? "password",
    blobStorageBucket: rawConfig.blobStorageBucket ?? "dittofeed",
    blobStorageRegion: rawConfig.blobStorageRegion ?? "us-east-1",
    exportLogsHyperDx: rawConfig.exportLogsHyperDx === "true",
    dittofeedTelemetryDisabled:
      rawConfig.dittofeedTelemetryDisabled === "true" ||
      nodeEnv === NodeEnvEnum.Development,
    onboardingUrl: rawConfig.onboardingUrl ?? "/dashboard/waiting-room",
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
  }
  return CONFIG;
}
