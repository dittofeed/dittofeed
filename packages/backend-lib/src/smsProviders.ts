import { TWILIO_SECRET_NAME } from "isomorphic-lib/src/constants";
import { pickBy } from "remeda";

import prisma from "./prisma";
import { SmsProviderConfig, UpsertSmsProviderRequest } from "./types";

export async function upsertSmsProvider(
  request: UpsertSmsProviderRequest
): Promise<SmsProviderConfig> {
  const setDefault = request.setDefault ?? false;

  await prisma().$transaction(async (tx) => {
    let secret = await tx.secret.findUnique({
      where: {
        workspaceId_name: {
          workspaceId: request.workspaceId,
          name: TWILIO_SECRET_NAME,
        },
      },
    });

    const updatedConfig = {
      ...(typeof secret?.configValue === "object" ? secret.configValue : {}),
      ...pickBy(request.smsProvider, (v) => v !== undefined && v.length > 0),
    };
    secret = await tx.secret.upsert({
      where: {
        workspaceId_name: {
          workspaceId: request.workspaceId,
          name: TWILIO_SECRET_NAME,
        },
      },
      create: {
        workspaceId: request.workspaceId,
        name: TWILIO_SECRET_NAME,
        configValue: updatedConfig,
      },
      update: {
        configValue: updatedConfig,
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
