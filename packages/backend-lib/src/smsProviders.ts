import { TWILIO_SECRET_NAME } from "isomorphic-lib/src/constants";

import prisma from "./prisma";
import { SmsProviderConfig, UpsertSmsProviderRequest } from "./types";

export async function upsertSmsProvider(
  request: UpsertSmsProviderRequest
): Promise<SmsProviderConfig> {
  const setDefault = request.setDefault ?? false;

  await prisma().$transaction(async (tx) => {
    const secret = await tx.secret.upsert({
      where: {
        workspaceId_name: {
          workspaceId: request.workspaceId,
          name: TWILIO_SECRET_NAME,
        },
      },
      create: {
        workspaceId: request.workspaceId,
        name: TWILIO_SECRET_NAME,
        configValue: request.smsProvider,
      },
      update: {
        configValue: request.smsProvider,
      },
    });
    const smsProvider = await tx.smsProvider.upsert({
      where: {
        workspaceId_type: {
          workspaceId: request.workspaceId,
          type: request.smsProvider.type,
        },
      },
      create: {
        workspaceId: request.workspaceId,
        type: request.smsProvider.type,
        secretId: secret.id,
      },
      update: {},
    });
    if (setDefault) {
      await tx.defaultSmsProvider.upsert({
        where: {
          workspaceId: request.workspaceId,
        },
        create: {
          workspaceId: request.workspaceId,
          smsProviderId: smsProvider.id,
        },
        update: {
          smsProviderId: smsProvider.id,
        },
      });
    }
  });
  return request.smsProvider;
}
