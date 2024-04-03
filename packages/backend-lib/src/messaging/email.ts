import { EmailProvider } from "@prisma/client";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import { EMAIL_PROVIDER_TYPE_TO_SECRET_NAME } from "isomorphic-lib/src/constants";
import {
  BadWorkspaceConfigurationType,
  EmailProviderSecret,
  EmailProviderType,
  MessageTemplateRenderError,
  PersistedEmailProvider,
  SubscriptionChange,
} from "isomorphic-lib/src/types";
import { err, ok, Result } from "neverthrow";

import logger from "../logger";
import prisma from "../prisma";
import { generateSubscriptionChangeUrl } from "../subscriptionGroups";

const LIST_UNSUBSCRIBE_POST = "List-Unsubscribe=One-Click" as const;

export interface UnsubscribeHeaders {
  "List-Unsubscribe-Post": typeof LIST_UNSUBSCRIBE_POST;
  "List-Unsubscribe": string;
  "List-ID": string;
}

export function constructUnsubscribeHeaders({
  to,
  from,
  userId,
  subscriptionGroupSecret,
  subscriptionGroupName,
  workspaceId,
  subscriptionGroupId,
}: {
  to: string;
  from: string;
  userId: string;
  subscriptionGroupSecret: string;
  subscriptionGroupName: string;
  workspaceId: string;
  subscriptionGroupId: string;
}): Result<UnsubscribeHeaders, MessageTemplateRenderError> {
  const domain = from.split("@")[1];
  if (!domain) {
    return err({
      type: BadWorkspaceConfigurationType.MessageTemplateRenderError,
      field: "from",
      error: `Invalid from address ${from}`,
    });
  }
  const url = generateSubscriptionChangeUrl({
    workspaceId,
    identifier: to,
    identifierKey: CHANNEL_IDENTIFIERS.Email,
    subscriptionSecret: subscriptionGroupSecret,
    userId,
    changedSubscription: subscriptionGroupId,
    subscriptionChange: SubscriptionChange.Unsubscribe,
  });
  return ok({
    "List-Unsubscribe-Post": LIST_UNSUBSCRIBE_POST,
    "List-Unsubscribe": `<${url}>`,
    "List-ID": `${subscriptionGroupName} <${subscriptionGroupId}.${domain}>`,
  });
}

export async function upsertEmailProvider({
  workspaceId,
  type,
}: {
  workspaceId: string;
  type: EmailProviderType;
}): Promise<EmailProvider | null> {
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
