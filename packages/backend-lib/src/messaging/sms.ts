import { SMS_PROVIDER_TYPE_TO_SECRET_NAME } from "isomorphic-lib/src/constants";

import logger from "../logger";
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

export async function getOrCreateSmsProviders({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<PersistedSmsProvider[]> {
  const smsProviders: PersistedSmsProvider[] = (
    await prisma().smsProvider.findMany({
      where: { workspaceId },
      include: {
        secret: true,
      },
    })
  ).flatMap((ep) => {
    let type: SmsProviderType;
    switch (ep.type) {
      case SmsProviderType.Twilio:
        type = SmsProviderType.Twilio;
        break;
      case SmsProviderType.Test:
        type = SmsProviderType.Test;
        break;
      default:
        logger().error(`Unknown email provider type: ${ep.type}`);
        return [];
    }
    return {
      workspaceId: ep.workspaceId,
      id: ep.id,
      type,
    };
  });

  const upsertPromises: Promise<unknown>[] = [];
  for (const typeKey in SmsProviderType) {
    const type = SmsProviderType[typeKey as keyof typeof SmsProviderType];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    const missing = smsProviders.find((ep) => ep.type === type) === undefined;
    if (missing) {
      upsertPromises.push(
        upsertSmsProvider({
          workspaceId,
          type,
        }).then((smsProvider) => {
          if (smsProvider) {
            smsProviders.push(smsProvider);
          }
        }),
      );
    }
  }
  await Promise.all(upsertPromises);
  return smsProviders;
}
