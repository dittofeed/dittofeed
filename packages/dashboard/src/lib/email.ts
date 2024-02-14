import { EmailProvider } from "@prisma/client";
import logger from "backend-lib/src/logger";
import { EMAIL_PROVIDER_TYPE_TO_SECRET_NAME } from "isomorphic-lib/src/constants";
import {
  EmailProviderSecret,
  EmailProviderType,
  PersistedEmailProvider,
} from "isomorphic-lib/src/types";

import prisma from "./prisma";

async function upsertEmailProvider({
  workspaceId,
  type,
}: {
  workspaceId: string;
  type: EmailProviderType;
}): Promise<EmailProvider | null> {
  if (type === EmailProviderType.Test) {
    return null;
  }
  const secretName = EMAIL_PROVIDER_TYPE_TO_SECRET_NAME[type];
  const secretConfig: EmailProviderSecret = {
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

  const ep = await prisma().emailProvider.upsert({
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
  return ep;
}

export async function getOrCreateEmailProviders({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<PersistedEmailProvider[]> {
  const emailProviders = await prisma().emailProvider.findMany({
    where: { workspaceId },
  });

  const upsertPromises: Promise<unknown>[] = [];
  for (const typeKey in EmailProviderType) {
    const type = EmailProviderType[typeKey as keyof typeof EmailProviderType];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    const missing = emailProviders.find((ep) => ep.type === type) === undefined;
    if (missing) {
      upsertPromises.push(
        upsertEmailProvider({
          workspaceId,
          type,
        }).then((ep) => {
          if (ep) {
            emailProviders.push(ep);
          }
        }),
      );
    }
  }
  await Promise.all(upsertPromises);
  const val = emailProviders.flatMap((ep) => {
    let type: EmailProviderType;
    switch (ep.type) {
      case EmailProviderType.Test:
        type = EmailProviderType.Test;
        break;
      case EmailProviderType.Sendgrid:
        type = EmailProviderType.Sendgrid;
        break;
      case EmailProviderType.AmazonSes:
        type = EmailProviderType.AmazonSes;
        break;
      case EmailProviderType.PostMark:
        type = EmailProviderType.PostMark;
        break;
      case EmailProviderType.Resend:
        type = EmailProviderType.Resend;
        break;
      case EmailProviderType.Smtp:
        type = EmailProviderType.Smtp;
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
