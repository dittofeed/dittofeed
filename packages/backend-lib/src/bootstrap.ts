import { Prisma } from "@prisma/client";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";
import { randomUUID } from "crypto";
import { DEBUG_USER_ID1 } from "isomorphic-lib/src/constants";
import { v5 as uuidv5 } from "uuid";

import { createWriteKey } from "./auth";
import { createBucket, storage } from "./blobStorage";
import { getDefaultMessageTemplates } from "./bootstrap/messageTemplates";
import { createClickhouseDb } from "./clickhouse";
import config from "./config";
import { generateSecureKey } from "./crypto";
import { kafkaAdmin } from "./kafka";
import logger from "./logger";
import { upsertMessageTemplate } from "./messaging";
import prisma from "./prisma";
import { prismaMigrate } from "./prisma/migrate";
import { segmentIdentifyEvent } from "./segmentIO";
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
  NodeEnvEnum,
  SubscriptionGroupType,
  UserPropertyDefinitionType,
} from "./types";
import { insertUserEvents } from "./userEvents";
import { createUserEventsTables } from "./userEvents/clickhouse";

async function bootstrapPostgres({
  workspaceName,
  workspaceDomain,
}: {
  workspaceName: string;
  workspaceDomain?: string;
}): Promise<{ workspaceId: string }> {
  await prismaMigrate();

  logger().info(
    {
      workspaceName,
      workspaceDomain,
    },
    "Upserting workspace.",
  );
  const workspace = await prisma().workspace.upsert({
    where: {
      name: workspaceName,
    },
    update: {
      domain: workspaceDomain,
    },
    create: {
      name: workspaceName,
      domain: workspaceDomain,
    },
  });
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
    ];

  await Promise.all([
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
    createWriteKey({
      workspaceId,
      writeKeyName: "default-write-key",
      writeKeyValue: generateSecureKey(8),
    }),
    ...getDefaultMessageTemplates({
      workspaceId,
    }).map(upsertMessageTemplate),
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
  return { workspaceId };
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
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger().info("Compute properties workflow already started.");
    } else {
      logger().error({ err }, "Failed to bootstrap worker.");

      if (config().bootstrapSafe) {
        throw err;
      }
    }
  }
}

async function insertDefaultEvents({ workspaceId }: { workspaceId: string }) {
  const messageId1 = randomUUID();
  const messageId2 = randomUUID();
  logger().debug("Inserting default events.");

  await insertUserEvents({
    workspaceId,
    userEvents: [
      {
        messageId: messageId1,
        messageRaw: JSON.stringify(
          segmentIdentifyEvent({
            messageId: messageId1,
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
          }),
        ),
      },
      {
        messageId: messageId2,
        messageRaw: JSON.stringify(
          segmentIdentifyEvent({
            messageId: messageId2,
            traits: {
              status: "onboarded",
              firstName: "Chandler",
              lastName: "Craig",
              email: "chandler@email.com",
              plan: "paid",
              // 2 days ago
              createdAt: new Date(
                Date.now() - 2 * 8.64 * 1000000,
              ).toISOString(),
            },
          }),
        ),
      },
    ],
  });
}

function handleErrorFactory(message: string) {
  return function handleError(err: unknown) {
    logger().error({ err }, message);
    if (config().bootstrapSafe) {
      throw err;
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
  const { workspaceId } = await bootstrapPostgres({
    workspaceName,
    workspaceDomain,
  });
  const { bootstrapSafe } = config();

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
