import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { SMS_PROVIDER_TYPE_TO_SECRET_NAME } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { db, upsert } from "../db";
import {
  defaultSmsProvider as dbDefaultSmsProvider,
  secret as dbSecret,
  smsProvider as dbSmsProvider,
} from "../db/schema";
import logger from "../logger";
import {
  ChannelType,
  PersistedSmsProvider,
  SmsProvider,
  SmsProviderType,
  SmsTemplateResource,
  UpsertSmsProviderRequest,
} from "../types";

export function defaultSmsDefinition(): SmsTemplateResource {
  return {
    type: ChannelType.Sms,
    body: "Example message to {{ user.phone }}",
  };
}

export async function upsertSmsProvider({
  workspaceId,
  config,
  setDefault,
}: UpsertSmsProviderRequest): Promise<PersistedSmsProvider> {
  const secretName = SMS_PROVIDER_TYPE_TO_SECRET_NAME[config.type];
  return db().transaction(async (tx) => {
    const secret = unwrap(
      await upsert({
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
      }),
    );
    const existingSmsProvider = await tx.query.smsProvider.findFirst({
      where: and(
        eq(dbSmsProvider.workspaceId, workspaceId),
        eq(dbSmsProvider.type, config.type),
      ),
    });
    let smsProvider: SmsProvider;
    if (existingSmsProvider) {
      smsProvider = existingSmsProvider;
    } else {
      const [newSmsProvider] = await tx
        .insert(dbSmsProvider)
        .values({
          workspaceId,
          type: config.type,
          secretId: secret.id,
        })
        .onConflictDoNothing()
        .returning();

      if (!newSmsProvider) {
        throw new Error("Failed to upsert SMS provider");
      }
      smsProvider = newSmsProvider;
    }
    if (setDefault) {
      await upsert({
        table: dbDefaultSmsProvider,
        target: [
          dbDefaultSmsProvider.workspaceId,
          dbDefaultSmsProvider.smsProviderId,
        ],
        values: {
          workspaceId,
          smsProviderId: smsProvider.id,
        },
        set: {
          smsProviderId: smsProvider.id,
        },
      });
    }
    return {
      workspaceId: smsProvider.workspaceId,
      id: smsProvider.id,
      type: config.type,
    };
  });
}

export async function getOrCreateSmsProviders({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<PersistedSmsProvider[]> {
  const smsProviders: PersistedSmsProvider[] = (
    await db().query.smsProvider.findMany({
      where: eq(dbSmsProvider.workspaceId, workspaceId),
      with: {
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
          config: { type },
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
