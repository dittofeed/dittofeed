import { EmailProviderSecret, SmsProviderConfig, SmsProviderSecret, SmsProviderType } from "isomorphic-lib/src/types";
import prisma from "./prisma";
import logger from "backend-lib/src/logger";
import { SmsProvider } from "@prisma/client";
import { SMS_PROVIDER_TYPE_TO_SECRET_NAME } from "isomorphic-lib/src/constants";

async function upsertSmsProvider({
  workspaceId,
  type,
}: {
  workspaceId: string;
  type: SmsProviderType;
}): Promise<SmsProvider | null> {
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
  return {...smsProvider,...secret};
}


export async function getOrCreateSmsProviders({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<SmsProviderConfig[]> {
  const smsProviders = await prisma().smsProvider.findMany({
    where: { workspaceId },
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
  const val = smsProviders.flatMap((ep) => {
    let type: SmsProviderType;
    switch (ep.type) {
      case SmsProviderType.Twilio:
        type = SmsProviderType.Twilio;
        break
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
  return val;
}
