import config from "./config";
import prisma from "./prisma";
import { UserPropertyDefinition, UserPropertyDefinitionType } from "./types";

export default async function bootstrap() {
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
