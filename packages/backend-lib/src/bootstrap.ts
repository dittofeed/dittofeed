import { Prisma, WorkspaceType } from "@prisma/client";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";
import { randomUUID } from "crypto";
import { writeKeyToHeader } from "isomorphic-lib/src/auth";
import { DEBUG_USER_ID1 } from "isomorphic-lib/src/constants";
import { err, ok } from "neverthrow";
import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "./apps/batch";
import { getOrCreateWriteKey } from "./auth";
import { createBucket, storage } from "./blobStorage";
import { getDefaultMessageTemplates } from "./bootstrap/messageTemplates";
import { createClickhouseDb } from "./clickhouse";
import config from "./config";
import { DEFAULT_WRITE_KEY_NAME } from "./constants";
import { kafkaAdmin } from "./kafka";
import logger from "./logger";
import { upsertMessageTemplate } from "./messaging";
import { getOrCreateEmailProviders } from "./messaging/email";
import { getOrCreateSmsProviders } from "./messaging/sms";
import prisma from "./prisma";
import { prismaMigrate } from "./prisma/migrate";
import {
  startComputePropertiesWorkflow,
  startGlobalCron,
} from "./segments/computePropertiesWorkflow/lifecycle";
import {
  upsertSubscriptionGroup,
  upsertSubscriptionSecret,
} from "./subscriptionGroups";
import {
  ChannelType,
  CreateWorkspaceErrorType,
  CreateWorkspaceResult,
  EventType,
  NodeEnvEnum,
  SubscriptionGroupType,
  UserPropertyDefinitionType,
  Workspace,
} from "./types";
import { createUserEventsTables } from "./userEvents/clickhouse";

const DOMAIN_REGEX =
  /^(?!-)[A-Za-z0-9-]+(?<!-)(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

function isValidDomain(domain: string): boolean {
  if (!domain) return false;
  if (domain.length > 255) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;

  return DOMAIN_REGEX.test(domain);
}

// FIXME create providers here
export async function bootstrapPostgres({
  workspaceName,
  workspaceDomain,
  workspaceType,
  workspaceExternalId,
  upsertWorkspace = true,
}: {
  workspaceName: string;
  workspaceDomain?: string;
  workspaceType?: WorkspaceType;
  workspaceExternalId?: string;
  upsertWorkspace?: boolean;
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
  if (upsertWorkspace) {
    workspace = await prisma().workspace.upsert({
      where: {
        name: workspaceName,
      },
      update: {
        domain: workspaceDomain,
        type: workspaceType,
        externalId: workspaceExternalId,
      },
      create: {
        name: workspaceName,
        domain: workspaceDomain,
        type: workspaceType,
        externalId: workspaceExternalId,
      },
    });
  } else {
    try {
      workspace = await prisma().workspace.create({
        data: {
          name: workspaceName,
          domain: workspaceDomain,
          type: workspaceType,
          externalId: workspaceExternalId,
        },
      });
    } catch (e) {
      const error = e as Prisma.PrismaClientKnownRequestError;
      if (error.code === "P2002") {
        return err({
          type: CreateWorkspaceErrorType.WorkspaceAlreadyExists,
        });
      }
      logger().error({ err: error }, "Failed to upsert workspace.");
      throw error;
    }
  }
  const workspaceId = workspace.id;

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

  const [writeKeyResource] = await Promise.all([
    getOrCreateWriteKey({
      workspaceId,
      writeKeyName: DEFAULT_WRITE_KEY_NAME,
    }),
    ...userProperties.map((up) =>
      prisma().userProperty.upsert({
        where: {
          workspaceId_name: {
            workspaceId: up.workspaceId,
            name: up.name,
          },
        },
        create: up,
        update: up,
      }),
    ),
    upsertSubscriptionSecret({
      workspaceId,
    }),
    ...getDefaultMessageTemplates({
      workspaceId,
    }).map(upsertMessageTemplate),
    getOrCreateSmsProviders({
      workspaceId,
    }),
    getOrCreateEmailProviders({
      workspaceId,
    }),
  ]);

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

export async function bootstrapWorker({
  workspaceId,
}: {
  workspaceId: string;
}) {
  logger().info("Bootstrapping worker.");
  try {
    await startComputePropertiesWorkflow({ workspaceId });
  } catch (e) {
    const error = e as WorkflowExecutionAlreadyStartedError;
    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      logger().info("Compute properties workflow already started.");
    } else {
      logger().error({ err: e }, "Failed to bootstrap worker.");

      if (config().bootstrapSafe) {
        throw e;
      }
    }
  }
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

export default async function bootstrap({
  workspaceName,
  workspaceDomain,
}: {
  workspaceName: string;
  workspaceDomain?: string;
}): Promise<{ workspaceId: string }> {
  await prismaMigrate();
  const workspace = await bootstrapPostgres({
    workspaceName,
    workspaceDomain,
  });
  if (workspace.isErr()) {
    logger().error({ err: workspace.error }, "Failed to bootstrap workspace.");
    throw new Error("Failed to bootstrap workspace.");
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
    await bootstrapWorker({ workspaceId });
    await startGlobalCron();
  }
  return { workspaceId };
}

export interface BootstrapWithDefaultsParams {
  workspaceName?: string;
  workspaceDomain?: string;
}

export function getBootstrapDefaultParams({
  workspaceName,
  workspaceDomain,
}: BootstrapWithDefaultsParams): Parameters<typeof bootstrap>[0] {
  const defaultWorkspaceName =
    config().nodeEnv === NodeEnvEnum.Development ? "Default" : null;
  const workspaceNameWithDefault = workspaceName ?? defaultWorkspaceName;

  if (!workspaceNameWithDefault) {
    throw new Error("Please provide a workspace name with --workspace-name");
  }

  return {
    workspaceName: workspaceNameWithDefault,
    workspaceDomain,
  };
}

export async function bootstrapWithDefaults(
  paramsWithoutDefaults: BootstrapWithDefaultsParams,
) {
  const params = getBootstrapDefaultParams(paramsWithoutDefaults);
  await bootstrap(params);
}
