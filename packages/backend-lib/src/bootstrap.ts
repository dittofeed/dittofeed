import { Prisma, WorkspaceType } from "@prisma/client";
import { randomUUID } from "crypto";
import { writeKeyToHeader } from "isomorphic-lib/src/auth";
import {
  DEBUG_USER_ID1,
  WORKSPACE_TOMBSTONE_PREFIX,
} from "isomorphic-lib/src/constants";
import { jsonParseSafeWithSchema } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";
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
import { QueryError, upsert } from "./db";
import {
  defaultEmailProvider as dbDefaultEmailProvider,
  defaultSmsProvider as dbDefaultSmsProvider,
  userProperty as dbUserProperty,
  workspace as dbWorkspace,
} from "./db/schema";
import { addFeatures, getFeature } from "./features";
import { kafkaAdmin } from "./kafka";
import logger from "./logger";
import { upsertMessageTemplate } from "./messaging";
import { getOrCreateEmailProviders } from "./messaging/email";
import { getOrCreateSmsProviders } from "./messaging/sms";
import { prismaMigrate } from "./prisma/migrate";
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
} from "./types";
import { createUserEventsTables } from "./userEvents/clickhouse";
import { createWorkspace } from "./workspaces/createWorkspace";

const DOMAIN_REGEX =
  /^(?!-)[A-Za-z0-9-]+(?<!-)(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

function isValidDomain(domain: string): boolean {
  if (!domain) return false;
  if (domain.length > 255) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;

  return DOMAIN_REGEX.test(domain);
}

export async function bootstrapPostgres({
  workspaceName,
  workspaceDomain,
  workspaceType,
  workspaceExternalId,
  upsertWorkspace = true,
  features,
}: {
  workspaceName: string;
  workspaceDomain?: string;
  workspaceType?: WorkspaceType;
  workspaceExternalId?: string;
  upsertWorkspace?: boolean;
  features?: Features;
}): Promise<CreateWorkspaceResult> {
  if (workspaceName.startsWith(WORKSPACE_TOMBSTONE_PREFIX)) {
    return err({
      type: CreateWorkspaceErrorType.WorkspaceNameViolation,
      message: `Workspace name cannot start with ${WORKSPACE_TOMBSTONE_PREFIX}`,
    });
  }

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
  let workspaceResult: Result<Workspace, QueryError>;
  if (upsertWorkspace) {
    workspaceResult = await upsert({
      table: dbWorkspace,
      values: {
        id: randomUUID(),
        name: workspaceName,
        domain: workspaceDomain,
        type: workspaceType,
        externalId: workspaceExternalId,
        updatedAt: new Date().toISOString(),
      },
      target: [dbWorkspace.name],
      set: {
        domain: workspaceDomain,
        type: workspaceType,
        externalId: workspaceExternalId,
      },
    });
  } else {
    workspaceResult = await createWorkspace({
      id: randomUUID(),
      name: workspaceName,
      domain: workspaceDomain,
      type: workspaceType,
      externalId: workspaceExternalId,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }
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
  const workspace = workspaceResult.value;
  const workspaceId = workspace.id;

  if (features) {
    await addFeatures({ workspaceId, features });
  }

  const userProperties: Prisma.UserPropertyUncheckedCreateWithoutUserPropertyAssignmentInput[] =
    [
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
        exampleValue: '"Jane Johnson"',
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
    ];

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
      upsert({
        table: dbUserProperty,
        values: {
          id: randomUUID(),
          ...up,
          createdAt: new Date().toISOString(),
          definitionUpdatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        target: [dbUserProperty.workspaceId, dbUserProperty.name],
        set: {},
      }),
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
      ? upsert({
          table: dbDefaultEmailProvider,
          values: {
            workspaceId,
            emailProviderId: testEmailProvider.id,
            updatedAt: new Date().toISOString(),
          },
          target: [dbDefaultEmailProvider.workspaceId],
          set: {},
        })
      : undefined,
    testSmsProvider
      ? upsert({
          table: dbDefaultSmsProvider,
          values: {
            workspaceId,
            smsProviderId: testSmsProvider.id,
            updatedAt: new Date().toISOString(),
          },
          target: [dbDefaultSmsProvider.workspaceId],
          set: {},
        })
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

async function bootstrapKafka() {
  const {
    userEventsTopicName,
    kafkaUserEventsPartitions,
    kafkaUserEventsReplicationFactor,
  } = config();
  await kafkaAdmin().connect();

  await kafkaAdmin().createTopics({
    waitForLeaders: true,
    topics: [
      {
        topic: userEventsTopicName,
        numPartitions: kafkaUserEventsPartitions,
        replicationFactor: kafkaUserEventsReplicationFactor,
      },
    ],
  });

  await kafkaAdmin().disconnect();
}

export async function bootstrapClickhouse() {
  logger().info("Bootstrapping clickhouse.");
  await createClickhouseDb();

  await createUserEventsTables({
    ingressTopic: config().userEventsTopicName,
  });
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

export default async function bootstrap({
  workspaceName,
  workspaceDomain,
  workspaceType,
  features,
}: {
  workspaceName: string;
  workspaceType: WorkspaceType;
  workspaceDomain?: string;
  features?: Features;
}): Promise<{ workspaceId: string }> {
  await prismaMigrate();
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
  if (workspaceType === WorkspaceType.Parent) {
    logger().info(
      "Parent workspace created, skipping remaining bootstrap steps.",
    );
    return { workspaceId: workspace.value.id };
  }
  const workspaceId = workspace.value.id;

  const initialBootstrap = [
    bootstrapClickhouse().catch(
      handleErrorFactory("failed to bootstrap clickhouse"),
    ),
  ];
  if (config().writeMode === "kafka") {
    initialBootstrap.push(
      bootstrapKafka().catch(handleErrorFactory("failed to bootstrap kafka")),
    );
  }
  await Promise.all(initialBootstrap);

  if (config().bootstrapEvents) {
    await insertDefaultEvents({ workspaceId });
  }

  if (config().enableBlobStorage) {
    await createBucket(storage(), {
      bucketName: config().blobStorageBucket,
    });
  }

  if (config().bootstrapWorker) {
    await bootstrapComputeProperties({ workspaceId });
    await startGlobalCron();
  }
  return { workspaceId };
}

export interface BootstrapWithoutDefaultsParams {
  workspaceName?: string;
  workspaceDomain?: string;
  workspaceType?: WorkspaceType;
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
    const featuresResult = jsonParseSafeWithSchema(featuresString, Features);
    if (featuresResult.isErr()) {
      logger().error({ err: featuresResult.error }, "Failed to parse features");
      throw new Error("Failed to parse features");
    }
    features = featuresResult.value;
  }

  return {
    workspaceName: workspaceNameWithDefault,
    workspaceDomain,
    workspaceType: workspaceType ?? WorkspaceType.Root,
    features,
  };
}

export async function bootstrapWithDefaults(
  paramsWithoutDefaults: BootstrapWithoutDefaultsParams,
) {
  const params = getBootstrapDefaultParams(paramsWithoutDefaults);
  await bootstrap(params);
}
