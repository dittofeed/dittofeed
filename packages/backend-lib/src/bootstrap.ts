import spawn from "cross-spawn";
import { randomUUID } from "crypto";

import { segmentIdentifyEvent } from "../test/factories/segment";
import { createClickhouseDb } from "./clickhouse";
import config from "./config";
import { kafkaAdmin } from "./kafka";
import prisma from "./prisma";
import { UserPropertyDefinition, UserPropertyDefinitionType } from "./types";
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

async function bootstrapPostgres() {
  const {
    defaultWorkspaceId,
    defaultIdUserPropertyId,
    defaultAnonymousIdIdUserPropertyId,
    defaultEmailUserPropertyId,
    defaultPhoneUserPropertyId,
    defaultFirstNameUserPropertyId,
    defaultLastNameUserPropertyId,
    defaultLanguageUserPropertyId,
    defaultAccountManagerUserPropertyId,
    defaultUserEventsTableVersion,
  } = config();

  await prismaMigrate();

  await prisma.workspace.upsert({
    where: {
      id: defaultWorkspaceId,
    },
    update: {},
    create: {
      id: defaultWorkspaceId,
      name: "Default",
    },
  });

  await prisma.currentUserEventsTable.upsert({
    where: {
      workspaceId: defaultWorkspaceId,
    },
    create: {
      workspaceId: defaultWorkspaceId,
      version: defaultUserEventsTableVersion,
    },
    update: {},
  });

  const idUserPropertyDefinition: UserPropertyDefinition = {
    type: UserPropertyDefinitionType.Id,
  };

  const anonymousIdUserPropertyDefinition: UserPropertyDefinition = {
    type: UserPropertyDefinitionType.AnonymousId,
  };

  const emailUserPropertyDefinition: UserPropertyDefinition = {
    type: UserPropertyDefinitionType.Trait,
    path: "email",
  };

  const phoneUserPropertyDefinition: UserPropertyDefinition = {
    type: UserPropertyDefinitionType.Trait,
    path: "phone",
  };

  const firstNameUserPropertyDefinition: UserPropertyDefinition = {
    type: UserPropertyDefinitionType.Trait,
    path: "firstName",
  };

  const lastNameUserPropertyDefinition: UserPropertyDefinition = {
    type: UserPropertyDefinitionType.Trait,
    path: "lastName",
  };

  const languageUserPropertyDefinition: UserPropertyDefinition = {
    type: UserPropertyDefinitionType.Trait,
    path: "language",
  };

  const accountManagerUserPropertyDefinition: UserPropertyDefinition = {
    type: UserPropertyDefinitionType.Trait,
    path: "accountManager",
  };

  await Promise.all([
    prisma.userProperty.createMany({
      data: [
        {
          id: defaultIdUserPropertyId,
          workspaceId: defaultWorkspaceId,
          name: "id",
          definition: idUserPropertyDefinition,
        },
        {
          id: defaultAnonymousIdIdUserPropertyId,
          workspaceId: defaultWorkspaceId,
          name: "anonymousId",
          definition: anonymousIdUserPropertyDefinition,
        },
        {
          id: defaultEmailUserPropertyId,
          workspaceId: defaultWorkspaceId,
          name: "email",
          definition: emailUserPropertyDefinition,
        },
        {
          id: defaultPhoneUserPropertyId,
          workspaceId: defaultWorkspaceId,
          name: "phone",
          definition: phoneUserPropertyDefinition,
        },
        {
          id: defaultFirstNameUserPropertyId,
          workspaceId: defaultWorkspaceId,
          name: "firstName",
          definition: firstNameUserPropertyDefinition,
        },
        {
          id: defaultLastNameUserPropertyId,
          workspaceId: defaultWorkspaceId,
          name: "lastName",
          definition: lastNameUserPropertyDefinition,
        },
        {
          id: defaultLanguageUserPropertyId,
          workspaceId: defaultWorkspaceId,
          name: "language",
          definition: languageUserPropertyDefinition,
        },
        {
          id: defaultAccountManagerUserPropertyId,
          workspaceId: defaultWorkspaceId,
          name: "accountManager",
          definition: accountManagerUserPropertyDefinition,
        },
      ],
      skipDuplicates: true,
    }),
  ]);
}

async function bootstrapKafka() {
  const {
    userEventsTopicName,
    kafkaUserEventsPartitions,
    kafkaUserEventsReplicationFactor,
  } = config();
  await kafkaAdmin.connect();

  await kafkaAdmin.createTopics({
    waitForLeaders: true,
    topics: [
      {
        topic: userEventsTopicName,
        numPartitions: kafkaUserEventsPartitions,
        replicationFactor: kafkaUserEventsReplicationFactor,
      },
    ],
  });

  await kafkaAdmin.disconnect();
}

async function bootstrapClickhouse() {
  const { defaultUserEventsTableVersion } = config();

  await createClickhouseDb();

  await createUserEventsTables({
    tableVersion: defaultUserEventsTableVersion,
    ingressTopic: config().userEventsTopicName,
  });
}

async function insertDefaultEvents() {
  const messageId1 = randomUUID();
  const messageId2 = randomUUID();
  await insertUserEvents({
    tableVersion: config().defaultUserEventsTableVersion,
    workspaceId: config().defaultWorkspaceId,
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

export default async function bootstrap() {
  await Promise.all([
    bootstrapPostgres().catch((e) =>
      console.error("failed to bootstrap postgres", e)
    ),
    bootstrapKafka().catch((e) =>
      console.error("failed to bootstrap kafka", e)
    ),
    bootstrapClickhouse().catch((e) =>
      console.error("failed to bootstrap clickhouse", e)
    ),
  ]);

  if (config().bootstrapEvents) {
    await insertDefaultEvents();
  }
}
