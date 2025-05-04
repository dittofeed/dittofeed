import { and, eq } from "drizzle-orm";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import { EMAIL_PROVIDER_TYPE_TO_SECRET_NAME } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  BadWorkspaceConfigurationType,
  EmailProviderType,
  MessageTemplateRenderError,
  PersistedEmailProvider,
  SubscriptionChange,
  UpsertEmailProviderRequest,
} from "isomorphic-lib/src/types";
import { err, ok, Result } from "neverthrow";

import { db, upsert } from "../db";
import {
  defaultEmailProvider as dbDefaultEmailProvider,
  emailProvider as dbEmailProvider,
  secret as dbSecret,
} from "../db/schema";
import logger from "../logger";
import { generateSubscriptionChangeUrl } from "../subscriptionGroups";
import { EmailProvider } from "../types";

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
  config,
  setDefault,
}: UpsertEmailProviderRequest): Promise<PersistedEmailProvider> {
  const secretName = EMAIL_PROVIDER_TYPE_TO_SECRET_NAME[config.type];
  return db().transaction(async (tx) => {
    const secret = await upsert({
      table: dbSecret,
      tx,
      target: [dbSecret.workspaceId, dbSecret.name],
      values: {
        workspaceId,
        name: secretName,
        configValue: config,
      },
      set: {
        configValue: config,
      },
    }).then(unwrap);

    const existingEmailProvider = await tx.query.emailProvider.findFirst({
      where: and(
        eq(dbEmailProvider.workspaceId, workspaceId),
        eq(dbEmailProvider.type, config.type),
      ),
    });

    let emailProvider: EmailProvider;
    if (existingEmailProvider) {
      emailProvider = existingEmailProvider;
    } else {
      const [newEmailProvider] = await tx
        .insert(dbEmailProvider)
        .values({
          workspaceId,
          type: config.type,
          secretId: secret.id,
        })
        .returning();

      if (!newEmailProvider) {
        throw new Error("Failed to upsert email provider");
      }
      emailProvider = newEmailProvider;
    }

    if (setDefault) {
      await upsert({
        table: dbDefaultEmailProvider,
        tx,
        target: [dbDefaultEmailProvider.workspaceId],
        values: {
          workspaceId,
          emailProviderId: emailProvider.id,
        },
        set: {
          emailProviderId: emailProvider.id,
        },
      }).then(unwrap);
    }
    return {
      workspaceId: emailProvider.workspaceId,
      id: emailProvider.id,
      type: config.type,
    };
  });
}

export async function getOrCreateEmailProviders({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<PersistedEmailProvider[]> {
  const emailProviders: PersistedEmailProvider[] = (
    await db().query.emailProvider.findMany({
      where: eq(dbEmailProvider.workspaceId, workspaceId),
      with: {
        secret: true,
      },
    })
  ).flatMap((ep) => {
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
      case EmailProviderType.MailChimp:
        type = EmailProviderType.MailChimp;
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
  for (const typeKey in EmailProviderType) {
    const type = EmailProviderType[typeKey as keyof typeof EmailProviderType];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    const missing = emailProviders.find((ep) => ep.type === type) === undefined;
    if (missing) {
      upsertPromises.push(
        upsertEmailProvider({
          workspaceId,
          config: { type },
        }).then((ep) => {
          if (ep) {
            emailProviders.push(ep);
          }
        }),
      );
    }
  }
  await Promise.all(upsertPromises);
  return emailProviders;
}

export {
  defaultEmailBody,
  defaultEmailDefinition,
} from "isomorphic-lib/src/email";
