import { Prisma } from "@prisma/client";
import spawn from "cross-spawn";
import { randomUUID } from "crypto";

import { segmentIdentifyEvent } from "../test/factories/segment";
import { createClickhouseDb } from "./clickhouse";
import config from "./config";
import { kafkaAdmin } from "./kafka";
import logger from "./logger";
import prisma from "./prisma";
import {
  computePropertiesWorkflow,
  generateComputePropertiesId,
} from "./segments/computePropertiesWorkflow";
import connectWorkflowClient from "./temporal/connectWorkflowClient";
import { UserPropertyDefinitionType } from "./types";
import {
  createUserEventsTables,
  insertUserEvents,
} from "./userEvents/clickhouse";

async function prismaMigrate() {
  await new Promise<void>((resolve, reject) => {
    spawn("yarn", ["workspace", "backend-lib", "prisma", "migrate", "deploy"], {
      stdio: "inherit",
    }).once("exit", (exitCode, signal) => {
      if (typeof exitCode === "number") {
        if (exitCode === 0) {
          resolve();
        } else {
          reject(
            new Error(`Migration failed with exit code: ${String(exitCode)}`)
          );
        }
      } else if (signal) {
        reject(new Error(`Migration failed with signal: ${String(signal)}`));
      } else {
        resolve();
      }
    });
  });
}

async function bootstrapPostgres({ workspaceId }: { workspaceId: string }) {
  const { defaultUserEventsTableVersion } = config();

  await prismaMigrate();

  await prisma().workspace.upsert({
    where: {
      id: workspaceId,
    },
    update: {},
    create: {
      id: workspaceId,
      name: "Default",
    },
  });

  await prisma().currentUserEventsTable.upsert({
    where: {
      workspaceId,
    },
    create: {
      workspaceId,
      version: defaultUserEventsTableVersion,
    },
    update: {},
  });

  const userProperties: Prisma.UserPropertyUncheckedCreateWithoutUserPropertyAssignmentInput[] =
    [
      {
        name: "id",
        workspaceId,
        definition: {
          type: UserPropertyDefinitionType.Id,
        },
      },
      {
        name: "anonymousId",
        workspaceId,
        definition: {
          type: UserPropertyDefinitionType.AnonymousId,
        },
      },
      {
        name: "email",
        workspaceId,
        definition: {
          type: UserPropertyDefinitionType.Trait,
          path: "email",
        },
      },
      {
        name: "phone",
        workspaceId,
        definition: {
          type: UserPropertyDefinitionType.Trait,
          path: "phone",
        },
      },
      {
        name: "firstName",
        workspaceId,
        definition: {
          type: UserPropertyDefinitionType.Trait,
          path: "firstName",
        },
      },
      {
        name: "lastName",
        workspaceId,
        definition: {
          type: UserPropertyDefinitionType.Trait,
          path: "lastName",
        },
      },
      {
        name: "language",
        workspaceId,
        definition: {
          type: UserPropertyDefinitionType.Trait,
          path: "language",
        },
      },
      {
        name: "accountManager",
        workspaceId,
        definition: {
          type: UserPropertyDefinitionType.Trait,
          path: "accountManager",
        },
      },
    ];

  await Promise.all(
    userProperties.map((up) =>
      prisma().userProperty.upsert({
        where: {
          workspaceId_name: {
            workspaceId: up.workspaceId,
            name: up.name,
          },
        },
        create: up,
        update: up,
      })
    )
  );
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

async function bootstrapClickhouse() {
  const { defaultUserEventsTableVersion } = config();

  await createClickhouseDb();

  await createUserEventsTables({
    tableVersion: defaultUserEventsTableVersion,
    ingressTopic: config().userEventsTopicName,
  });
}

async function bootstrapWorker() {
  const temporalClient = await connectWorkflowClient();

  try {
    await temporalClient.start(computePropertiesWorkflow, {
      taskQueue: "default",
      workflowId: generateComputePropertiesId(config().defaultWorkspaceId),
      args: [
        {
          tableVersion: config().defaultUserEventsTableVersion,
          workspaceId: config().defaultWorkspaceId,
          shouldContinueAsNew: true,
        },
      ],
    });
  } catch (err) {
    logger().error({ err }, "Failed to bootstrap worker.");
  }
}

async function insertDefaultEvents({ workspaceId }: { workspaceId: string }) {
  const messageId1 = randomUUID();
  const messageId2 = randomUUID();
  await insertUserEvents({
    tableVersion: config().defaultUserEventsTableVersion,
    workspaceId,
    events: [
      {
        messageId: messageId1,
        messageRaw: segmentIdentifyEvent({
          messageId: messageId1,
          traits: {
            status: "onboarding",
            firstName: "Max",
            lastName: "Gurewitz",
            plan: "free",
            phone: "8005551234",
            // 1 day ago
            createdAt: new Date(Date.now() - 8.64 * 1000000).toISOString(),
          },
        }),
      },
      {
        messageId: messageId2,
        messageRaw: segmentIdentifyEvent({
          messageId: messageId2,
          traits: {
            status: "onboarded",
            firstName: "Chandler",
            lastName: "Craig",
            plan: "paid",
            // 2 days ago
            createdAt: new Date(Date.now() - 2 * 8.64 * 1000000).toISOString(),
          },
        }),
      },
    ],
  });
}

export default async function bootstrap({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const initialBootstrap = [
    bootstrapPostgres({ workspaceId }).catch((err) =>
      logger().error({ err }, "failed to bootstrap postgres")
    ),
    bootstrapClickhouse().catch((err) =>
      logger().error({ err }, "failed to bootstrap clickhouse")
    ),
  ];
  if (config().writeMode === "kafka") {
    initialBootstrap.push(
      bootstrapKafka().catch((err) =>
        logger().error({ err }, "failed to bootstrap kafka")
      )
    );
  }
  await Promise.all(initialBootstrap);

  if (config().bootstrapEvents) {
    await insertDefaultEvents({ workspaceId });
  }

  if (config().bootstrapWorker) {
    await bootstrapWorker();
  }
}
