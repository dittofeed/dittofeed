import { Static, TSchema } from "@sinclair/typebox";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  WorkspaceMemberSetting,
  WorkspaceMemberSettingSchema,
} from "isomorphic-lib/src/types";

import { db } from "./db";
import * as schema from "./db/schema";
import logger from "./logger";

function getSecretName(settingName: string) {
  return `workspace-member-setting-${settingName}`;
}

export async function writeSecretWorkspaceMemberSettings<
  T extends WorkspaceMemberSetting,
>({
  workspaceId,
  workspaceMemberId,
  config,
}: {
  workspaceId: string;
  workspaceMemberId: string;
  config: T;
}) {
  await db().transaction(async (tx) => {
    const secretId = randomUUID();
    await tx.insert(schema.secret).values({
      workspaceId,
      id: secretId,
      name: getSecretName(config.type),
      configValue: config,
    });
    await tx.insert(schema.workspaceMemberSetting).values({
      workspaceId,
      workspaceMemberId,
      secretId,
      name: config.type,
      config,
    });
  });
}

export async function updateSecretWorkspaceMemberSettings<
  S extends WorkspaceMemberSettingSchema,
>({
  workspaceId,
  workspaceMemberId,
  update,
  name,
  schema: settingsSchema,
}: {
  workspaceId: string;
  workspaceMemberId: string;
  name: S["type"];
  schema: S;
  update: (existingConfig: Static<S>) => Static<S>;
}): Promise<Static<S> | null> {
  return await db().transaction(async (tx) => {
    const secretName = getSecretName(name);
    const existingSecret = await tx.query.secret.findFirst({
      where: and(
        eq(schema.secret.workspaceId, workspaceId),
        eq(schema.secret.name, secretName),
      ),
    });
    if (!existingSecret) {
      return null;
    }
    const configResult = schemaValidateWithErr(
      existingSecret.configValue,
      settingsSchema,
    );
    if (configResult.isErr()) {
      logger().error(
        {
          workspaceId,
          workspaceMemberId,
          err: configResult.error,
        },
        "Error validating workspace member setting",
      );
      return null;
    }
    const existingConfig = configResult.value;
    const newConfig = update(existingConfig);

    await tx
      .update(schema.secret)
      .set({
        configValue: newConfig,
      })
      .where(eq(schema.secret.id, existingSecret.id));
    return newConfig;
  });
}
