import spawn from "cross-spawn";

import { createClickhouseDb } from "./clickhouse";
import config from "./config";
import { kafkaAdmin } from "./kafka";
import prisma from "./prisma";
import { UserPropertyDefinition, UserPropertyDefinitionType } from "./types";
import { createUserEventsTables } from "./userEvents/clickhouse";

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

export default async function bootstrap() {
  await prismaMigrate();

  const {
    defaultWorkspaceId,
    defaultIdUserPropertyId,
    defaultAnonymousIdIdUserPropertyId,
    defaultEmailUserPropertyId,
    defaultPhoneUserPropertyId,
    defaultFirstNameUserPropertyId,
    defaultLastNameUserPropertyId,
    defaultLanguageUserPropertyId,
    defaultUserEventsTableVersion,
    defaultAccountManagerUserPropertyId,
  } = config();

  await Promise.all([
    prisma.workspace.upsert({
      where: {
        id: defaultWorkspaceId,
      },
      update: {},
      create: {
        id: defaultWorkspaceId,
        name: "Default",
      },
    }),
    kafkaAdmin.connect(),
    createClickhouseDb(),
  ]);

  const [currentUserEventsTable] = await Promise.all([
    prisma.currentUserEventsTable.upsert({
      where: {
        workspaceId: defaultWorkspaceId,
      },
      create: {
        workspaceId: defaultWorkspaceId,
        version: defaultUserEventsTableVersion,
      },
      update: {},
    }),
    kafkaAdmin.createTopics({
      waitForLeaders: true,
      topics: [
        {
          topic: config().userEventsTopicName,
          numPartitions: 1,
          replicationFactor: 1,
        },
      ],
    }),
  ]);

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
    createUserEventsTables({
      tableVersion: currentUserEventsTable.version,
      ingressTopic: config().userEventsTopicName,
    }),
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

  await kafkaAdmin.disconnect();
}
