import { randomUUID } from "crypto";
import { writeKeyToHeader } from "isomorphic-lib/src/auth";
import {
  DEBUG_USER_ID1,
  WORKSPACE_TOMBSTONE_PREFIX,
} from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { jsonParseSafeWithSchema } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok } from "neverthrow";
import { PostgresError } from "pg-error-enum";
import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "./apps/batch";
import { getOrCreateWriteKey } from "./auth";
import { createBucket, storage } from "./blobStorage";
import { getDefaultMessageTemplates } from "./bootstrap/messageTemplates";
import { createClickhouseDb } from "./clickhouse";
import {
  startComputePropertiesWorkflow,
  startComputePropertiesWorkflowGlobal,
  startGlobalCron,
} from "./computedProperties/computePropertiesWorkflow/lifecycle";
import config from "./config";
import { DEFAULT_WRITE_KEY_NAME } from "./constants";
import { insert } from "./db";
import {
  defaultEmailProvider as dbDefaultEmailProvider,
  defaultSmsProvider as dbDefaultSmsProvider,
  userProperty as dbUserProperty,
} from "./db/schema";
import { addFeatures, getFeature } from "./features";
import { kafkaAdmin } from "./kafka";
import logger from "./logger";
import { upsertMessageTemplate } from "./messaging";
import { getOrCreateEmailProviders } from "./messaging/email";
import { getOrCreateSmsProviders } from "./messaging/sms";
import { drizzleMigrate } from "./migrate";
import {
  upsertSubscriptionGroup,
  upsertSubscriptionSecret,
} from "./subscriptionGroups";
import {
  ChannelType,
  CreateWorkspaceErrorType,
  CreateWorkspaceResult,
  EmailProviderType,
  EventType,
  FeatureNamesEnum,
  Features,
  NodeEnvEnum,
  SmsProviderType,
  SubscriptionGroupType,
  UserPropertyDefinitionType,
  Workspace,
  WorkspaceTypeApp,
  WorkspaceTypeAppEnum,
} from "./types";
import {
  createKafkaTables,
  createUserEventsTables,
  dropKafkaTables,
} from "./userEvents/clickhouse";
import { upsertWorkspace } from "./workspaces/createWorkspace";

const DOMAIN_REGEX =
  /^(?!-)[A-Za-z0-9-]+(?<!-)(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

const INVALID_COMMON_EMAIL_DOMAINS = new Set([
  "gmail",
  "yahoo",
  "hotmail",
  "outlook",
  "aol",
  "icloud",
  "protonmail",
  "zoho",
  "mail",
  "gmx",
  "yandex",
]);

function isValidDomain(domain: string): boolean {
  if (!domain) return false;
  const lowerDomain = domain.toLowerCase();

  if (lowerDomain.length > 255) return false;
  if (lowerDomain.startsWith(".") || lowerDomain.endsWith(".")) return false;

  // Reject common email domains by checking their constituent parts
  const parts = lowerDomain.split(".");
  // A domain must have at least two parts (e.g., name.tld) to be checked here.
  // Shorter or malformed domains will be caught by the DOMAIN_REGEX.
  if (parts.length >= 2) {
    // Iterate through parts of the domain, excluding the last part (assumed TLD).
    // For "foo.gmail.com", parts are ["foo", "gmail", "com"]. We check "foo" and "gmail".
    for (const part of parts) {
      if (INVALID_COMMON_EMAIL_DOMAINS.has(part)) {
        return false; // Found a restricted part
      }
    }
  }

  return DOMAIN_REGEX.test(lowerDomain);
}

export async function bootstrapPostgres({
  workspaceName,
  workspaceDomain,
  workspaceType,
  workspaceExternalId,
  features,
  existingWorkspace,
  userPropertyAllowList,
}: {
  workspaceName: string;
  workspaceDomain?: string;
  workspaceType?: WorkspaceTypeApp;
  workspaceExternalId?: string;
  features?: Features;
  existingWorkspace?: Workspace;
  userPropertyAllowList?: Set<string>;
}): Promise<CreateWorkspaceResult> {
  logger().info(
    {
      workspaceName,
      workspaceDomain,
      workspaceType,
      workspaceExternalId,
    },
    "Upserting workspace.",
  );
  if (workspaceDomain && !isValidDomain(workspaceDomain)) {
    return err({
      type: CreateWorkspaceErrorType.InvalidDomain,
    });
  }
  let workspace: Workspace;
  if (existingWorkspace) {
    workspace = existingWorkspace;
  } else {
    if (workspaceName.startsWith(WORKSPACE_TOMBSTONE_PREFIX)) {
      return err({
        type: CreateWorkspaceErrorType.WorkspaceNameViolation,
        message: `Workspace name cannot start with ${WORKSPACE_TOMBSTONE_PREFIX}`,
      });
    }
    const workspaceResult = await upsertWorkspace({
      name: workspaceName,
      domain: workspaceDomain,
      type: workspaceType,
      externalId: workspaceExternalId,
    });
    if (workspaceResult.isErr()) {
      if (
        workspaceResult.error.code === PostgresError.FOREIGN_KEY_VIOLATION ||
        workspaceResult.error.code === PostgresError.UNIQUE_VIOLATION
      ) {
        return err({
          type: CreateWorkspaceErrorType.WorkspaceAlreadyExists,
        });
      }
      logger().error(
        { err: workspaceResult.error },
        "Failed to upsert workspace.",
      );
      throw workspaceResult.error;
    }
    workspace = workspaceResult.value;
  }
  const workspaceId = workspace.id;

  if (features) {
    await addFeatures({ workspaceId, features });
  }

  let userProperties: Omit<
    typeof dbUserProperty.$inferInsert,
    "id" | "createdAt" | "updatedAt" | "definitionUpdatedAt"
  >[] = [
    {
      name: "id",
      workspaceId,
      definition: {
        type: UserPropertyDefinitionType.Id,
      },
      exampleValue: '"62b44d22-0d14-48bb-80d9-fb5da5b26a0c"',
    },
    {
      name: "anonymousId",
      workspaceId,
      definition: {
        type: UserPropertyDefinitionType.AnonymousId,
      },
      exampleValue: '"b8fa9198-6475-4b18-bb64-aafd0c8b717e"',
    },
    {
      name: "email",
      workspaceId,
      definition: {
        type: UserPropertyDefinitionType.Trait,
        path: "email",
      },
      exampleValue: '"name@email.com"',
    },
    {
      name: "phone",
      workspaceId,
      definition: {
        type: UserPropertyDefinitionType.Trait,
        path: "phone",
      },
      exampleValue: '"8885551234"',
    },
    {
      name: "deviceToken",
      workspaceId,
      definition: {
        type: UserPropertyDefinitionType.Trait,
        path: "deviceToken",
      },
      exampleValue:
        '"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"',
    },
    {
      name: "firstName",
      workspaceId,
      definition: {
        type: UserPropertyDefinitionType.Trait,
        path: "firstName",
      },
      exampleValue: '"Matt"',
    },
    {
      name: "lastName",
      workspaceId,
      definition: {
        type: UserPropertyDefinitionType.Trait,
        path: "lastName",
      },
      exampleValue: '"Smith"',
    },
    {
      name: "language",
      workspaceId,
      definition: {
        type: UserPropertyDefinitionType.Trait,
        path: "language",
      },
      exampleValue: '"en-US"',
    },
    {
      name: "accountManager",
      workspaceId,
      definition: {
        type: UserPropertyDefinitionType.Trait,
        path: "accountManager",
      },
      exampleValue: '"jane.johnson@example.com"',
    },
    {
      name: "latLon",
      workspaceId,
      definition: {
        type: UserPropertyDefinitionType.Trait,
        path: "latLon",
      },
      exampleValue: "33.812511,-117.9189762",
    },
    {
      name: "timezone",
      workspaceId,
      definition: {
        type: UserPropertyDefinitionType.Trait,
        path: "timezone",
      },
      exampleValue: '"America/New_York"',
    },
  ];
  if (userPropertyAllowList) {
    userProperties = userProperties.filter((up) =>
      userPropertyAllowList.has(up.name),
    );
  }
  const [writeKeyResource, smsProviders, emailProviders] = await Promise.all([
    getOrCreateWriteKey({
      workspaceId,
      writeKeyName: DEFAULT_WRITE_KEY_NAME,
    }),
    getOrCreateSmsProviders({
      workspaceId,
    }),
    getOrCreateEmailProviders({
      workspaceId,
    }),
    ...userProperties.map((up) =>
      insert({
        table: dbUserProperty,
        values: up,
        doNothingOnConflict: true,
      }).then(unwrap),
    ),
    upsertSubscriptionSecret({
      workspaceId,
    }),
    ...getDefaultMessageTemplates({
      workspaceId,
    }).map(upsertMessageTemplate),
  ]);
  const testEmailProvider = emailProviders.find(
    (ep) => ep.type === EmailProviderType.Test,
  );
  const testSmsProvider = smsProviders.find(
    (sp) => sp.type === SmsProviderType.Test,
  );

  await Promise.all([
    upsertSubscriptionGroup({
      workspaceId,
      id: uuidv5("email-subscription-group", workspaceId),
      name: `${workspaceName} - Email`,
      type: SubscriptionGroupType.OptOut,
      channel: ChannelType.Email,
    }),
    upsertSubscriptionGroup({
      workspaceId,
      id: uuidv5("mobile-push-subscription-group", workspaceId),
      name: `${workspaceName} - Mobile Push`,
      type: SubscriptionGroupType.OptOut,
      channel: ChannelType.MobilePush,
    }),
    upsertSubscriptionGroup({
      workspaceId,
      id: uuidv5("sms-subscription-group", workspaceId),
      name: `${workspaceName} - SMS`,
      type: SubscriptionGroupType.OptOut,
      channel: ChannelType.Sms,
    }),
    testEmailProvider
      ? insert({
          table: dbDefaultEmailProvider,
          values: {
            workspaceId,
            emailProviderId: testEmailProvider.id,
          },
          doNothingOnConflict: true,
        }).then(unwrap)
      : undefined,
    testSmsProvider
      ? insert({
          table: dbDefaultSmsProvider,
          values: {
            workspaceId,
            smsProviderId: testSmsProvider.id,
          },
          doNothingOnConflict: true,
        }).then(unwrap)
      : undefined,
  ]);
  const writeKey = writeKeyToHeader({
    secretId: writeKeyResource.secretId,
    writeKeyValue: writeKeyResource.writeKeyValue,
  });
  return ok({
    externalId: workspace.externalId ?? undefined,
    domain: workspace.domain ?? undefined,
    name: workspace.name,
    id: workspace.id,
    status: workspace.status,
    type: workspace.type,
    writeKey,
  });
}

export async function bootstrapKafka() {
  const {
    userEventsTopicName,
    kafkaUserEventsPartitions,
    kafkaUserEventsReplicationFactor,
  } = config();

  const admin = kafkaAdmin();
  await admin.connect();

  try {
    // Check if topic already exists to make operation idempotent
    const existingTopics = await admin.listTopics();
    const topicExists = existingTopics.includes(userEventsTopicName);

    if (!topicExists) {
      // Set waitForLeaders: false to avoid KafkaJS hanging bug
      // Add timeout to prevent indefinite hanging
      await admin.createTopics({
        waitForLeaders: false,
        timeout: 30000,
        topics: [
          {
            topic: userEventsTopicName,
            numPartitions: kafkaUserEventsPartitions,
            replicationFactor: kafkaUserEventsReplicationFactor,
          },
        ],
      });

      logger().info({ topic: userEventsTopicName }, "Created Kafka topic");
    } else {
      logger().info(
        { topic: userEventsTopicName },
        "Kafka topic already exists",
      );
    }

    // Drop and recreate Kafka tables if using Kafka write mode
    try {
      logger().info("Dropping Kafka clickhouse tables");
      await dropKafkaTables();
    } catch (error) {
      logger().warn("Failed to drop kafka tables, continuing anyway", {
        err: error,
      });
    }

    logger().info("Creating Kafka clickhouse tables");
    await createKafkaTables({
      ingressTopic: userEventsTopicName,
    });
  } finally {
    await admin.disconnect();
  }
}

export async function bootstrapClickhouse() {
  logger().info("Bootstrapping clickhouse.");
  await createClickhouseDb();

  await createUserEventsTables();
}

async function insertDefaultEvents({ workspaceId }: { workspaceId: string }) {
  logger().debug("Inserting default events.");
  await submitBatch({
    workspaceId,
    data: {
      batch: [
        {
          type: EventType.Identify,
          messageId: randomUUID(),
          userId: DEBUG_USER_ID1,
          traits: {
            status: "onboarding",
            firstName: "Max",
            lastName: "Gurewitz",
            email: "max@email.com",
            plan: "free",
            phone: "8005551234",
            // 1 day ago
            createdAt: new Date(Date.now() - 8.64 * 1000000).toISOString(),
          },
        },
        {
          type: EventType.Identify,
          messageId: randomUUID(),
          userId: "user-id-2",
          traits: {
            status: "onboarded",
            firstName: "Chandler",
            lastName: "Craig",
            email: "chandler@email.com",
            plan: "paid",
            // 2 days ago
            createdAt: new Date(Date.now() - 2 * 8.64 * 1000000).toISOString(),
          },
        },
        {
          type: EventType.Track,
          messageId: randomUUID(),
          userId: "user-id-2",
          event: "CLICKED_BUTTON",
          properties: {
            buttonColor: "blue",
          },
        },
      ],
    },
  });
}

function handleErrorFactory(message: string) {
  return function handleError(e: unknown) {
    const error = e as Error;
    logger().error({ err: error }, message);
    if (config().bootstrapSafe) {
      throw error;
    }
  };
}

export async function bootstrapComputeProperties({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const useGlobal = await getFeature({
    workspaceId,
    name: FeatureNamesEnum.ComputePropertiesGlobal,
  });
  if (useGlobal) {
    await startComputePropertiesWorkflowGlobal();
  } else {
    await startComputePropertiesWorkflow({ workspaceId });
  }
}

export interface BootstrapWorkspaceParams {
  workspaceName: string;
  workspaceType: WorkspaceTypeApp;
  workspaceDomain?: string;
  features?: Features;
}

export async function bootstrapWorkspace({
  workspaceName,
  workspaceType,
  workspaceDomain,
  features,
}: BootstrapWorkspaceParams): Promise<{ workspaceId: string }> {
  const workspace = await bootstrapPostgres({
    workspaceName,
    workspaceDomain,
    workspaceType,
    features,
  });
  if (workspace.isErr()) {
    logger().error({ err: workspace.error }, "Failed to bootstrap workspace.");
    throw new Error("Failed to bootstrap workspace.");
  }
  if (workspaceType === WorkspaceTypeApp.Parent) {
    logger().info(
      "Parent workspace created, skipping remaining bootstrap steps.",
    );
    return { workspaceId: workspace.value.id };
  }
  const workspaceId = workspace.value.id;

  if (config().bootstrapEvents) {
    await insertDefaultEvents({ workspaceId });
  }

  if (config().bootstrapWorker) {
    await bootstrapComputeProperties({ workspaceId });
    await startGlobalCron();
  }
  return { workspaceId };
}

export async function bootstrapBlobStorage() {
  await createBucket(storage(), {
    bucketName: config().blobStorageBucket,
  });
}

export async function bootstrapDependencies(): Promise<void> {
  const promises = [
    drizzleMigrate(),
    bootstrapClickhouse().catch(
      handleErrorFactory("failed to bootstrap clickhouse"),
    ),
  ];
  if (config().enableBlobStorage) {
    promises.push(bootstrapBlobStorage());
  }
  if (config().writeMode === "kafka") {
    promises.push(bootstrapKafka());
  }
  await Promise.all(promises);
}

export default async function bootstrap(
  params: BootstrapWorkspaceParams,
): Promise<{ workspaceId: string }> {
  await bootstrapDependencies();
  return bootstrapWorkspace(params);
}

export interface BootstrapWithoutDefaultsParams {
  workspaceName?: string;
  workspaceDomain?: string;
  workspaceType?: WorkspaceTypeApp;
  features?: string;
}

export function getBootstrapDefaultParams({
  workspaceName,
  workspaceDomain,
  workspaceType,
  features: featuresString,
}: BootstrapWithoutDefaultsParams): Parameters<typeof bootstrap>[0] {
  const defaultWorkspaceName =
    config().nodeEnv === NodeEnvEnum.Development ? "Default" : null;
  const workspaceNameWithDefault = workspaceName ?? defaultWorkspaceName;

  if (!workspaceNameWithDefault) {
    throw new Error("Please provide a workspace name with --workspace-name");
  }
  let features: Features | undefined;
  if (featuresString) {
    const featuresResult = jsonParseSafeWithSchema(featuresString, Features, {
      method: "standard",
    });
    if (featuresResult.isErr()) {
      logger().error({ err: featuresResult.error }, "Failed to parse features");
      throw new Error("Failed to parse features");
    }
    features = featuresResult.value;
  }

  return {
    workspaceName: workspaceNameWithDefault,
    workspaceDomain,
    workspaceType: workspaceType ?? WorkspaceTypeAppEnum.Root,
    features,
  };
}

export async function bootstrapWithDefaults(
  paramsWithoutDefaults: BootstrapWithoutDefaultsParams,
) {
  const params = getBootstrapDefaultParams(paramsWithoutDefaults);
  await bootstrap(params);
}
