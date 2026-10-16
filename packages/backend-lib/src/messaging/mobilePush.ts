import { and, eq } from "drizzle-orm";
import { MOBILE_PUSH_PROVIDER_TYPE_TO_SECRET_NAME } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { db, upsert } from "../db";
import {
  defaultMobilePushProvider as dbDefaultMobilePushProvider,
  mobilePushProvider as dbMobilePushProvider,
  secret as dbSecret,
} from "../db/schema";
import logger from "../logger";
import {
  MobilePushProvider,
  MobilePushProviderType,
  PersistedMobilePushProvider,
  UpsertMobilePushProviderRequest,
} from "../types";

export async function upsertMobilePushProvider({
  workspaceId,
  config,
  setDefault,
}: UpsertMobilePushProviderRequest): Promise<PersistedMobilePushProvider> {
  const secretName = MOBILE_PUSH_PROVIDER_TYPE_TO_SECRET_NAME[config.type];
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
    const existingMobilePushProvider =
      await tx.query.mobilePushProvider.findFirst({
        where: and(
          eq(dbMobilePushProvider.workspaceId, workspaceId),
          eq(dbMobilePushProvider.type, config.type),
        ),
      });
    let mobilePushProvider: MobilePushProvider;
    if (existingMobilePushProvider) {
      mobilePushProvider = existingMobilePushProvider;
    } else {
      const [newMobilePushProvider] = await tx
        .insert(dbMobilePushProvider)
        .values({
          workspaceId,
          type: config.type,
          secretId: secret.id,
        })
        .returning();

      if (!newMobilePushProvider) {
        throw new Error("Failed to upsert MobilePush provider");
      }
      mobilePushProvider = newMobilePushProvider;
    }
    if (setDefault) {
      await upsert({
        table: dbDefaultMobilePushProvider,
        tx,
        target: [dbDefaultMobilePushProvider.workspaceId],
        values: {
          workspaceId,
          mobilePushProviderId: mobilePushProvider.id,
        },
        set: {
          mobilePushProviderId: mobilePushProvider.id,
        },
      }).then(unwrap);
    }
    return {
      workspaceId: mobilePushProvider.workspaceId,
      id: mobilePushProvider.id,
      type: config.type,
    };
  });
}

export async function getOrCreateMobilePushProviders({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<PersistedMobilePushProvider[]> {
  const mobilePushProviders: PersistedMobilePushProvider[] = (
    await db().query.mobilePushProvider.findMany({
      where: eq(dbMobilePushProvider.workspaceId, workspaceId),
      with: {
        secret: true,
      },
    })
  ).flatMap((ep) => {
    let type: MobilePushProviderType;
    switch (ep.type) {
      case MobilePushProviderType.Firebase:
        type = MobilePushProviderType.Firebase;
        break;
      case MobilePushProviderType.Test:
        type = MobilePushProviderType.Test;
        break;
      default:
        logger().error(
          {
            workspaceId,
            mobilePushProviderType: ep.type,
          },
          "Unknown mobile push provider type",
        );
        return [];
    }
    return {
      workspaceId: ep.workspaceId,
      id: ep.id,
      type,
    };
  });

  const upsertPromises: Promise<unknown>[] = [];
  for (const type of Object.values(MobilePushProviderType)) {
    // Firebase providers require a configured service account, so they can't be
    // auto-created without one.
    if (type === MobilePushProviderType.Firebase) {
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    const missing =
      mobilePushProviders.find((ep) => ep.type === type) === undefined;
    if (missing) {
      upsertPromises.push(
        upsertMobilePushProvider({
          workspaceId,
          config: { type },
        }).then((mobilePushProvider) => {
          mobilePushProviders.push(mobilePushProvider);
        }),
      );
    }
  }
  await Promise.all(upsertPromises);
  return mobilePushProviders;
}
