import { SMS_PROVIDER_TYPE_TO_SECRET_NAME } from "isomorphic-lib/src/constants";

import prisma from "../prisma";
import {
  ChannelType,
  PersistedSmsProvider,
  SmsProviderSecret,
  SmsProviderType,
  SmsTemplateResource,
} from "../types";

export function defaultSmsDefinition(): SmsTemplateResource {
  return {
    type: ChannelType.Sms,
    body: "Example message to {{ user.phone }}",
  };
}

export async function upsertSmsProvider({
  workspaceId,
  type,
}: {
  workspaceId: string;
  type: SmsProviderType;
}): Promise<PersistedSmsProvider | null> {
  const secretName = SMS_PROVIDER_TYPE_TO_SECRET_NAME[type];
  const secretConfig: SmsProviderSecret = {
    type,
  };
  const secret = await prisma().secret.upsert({
    where: {
      workspaceId_name: {
        workspaceId,
        name: secretName,
      },
    },
    create: {
      workspaceId,
      name: secretName,
      configValue: secretConfig,
    },
    update: {},
  });

  const smsProvider = await prisma().smsProvider.upsert({
    where: {
      workspaceId_type: {
        workspaceId,
        type,
      },
    },
    create: {
      workspaceId,
      type,
      secretId: secret.id,
    },
    update: {},
  });
  return {
    workspaceId: smsProvider.workspaceId,
    id: smsProvider.id,
    type,
  };
}
