import { Static, TSchema } from "@sinclair/typebox";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  WorkspaceMemberSetting,
  WorkspaceMemberSettingSchema,
  WorkspaceMemberSettingType,
  WorkspaceSettingSchemaRecord,
  WorkspaceSettingsResource,
} from "isomorphic-lib/src/types";

import { db } from "./db";
import * as schema from "./db/schema";
import logger from "./logger";
import { ok, Result } from "neverthrow";

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
    const [secret] = await tx
      .insert(schema.secret)
      .values({
        workspaceId,
        name: getSecretName(config.type),
        configValue: config,
      })
      .onConflictDoUpdate({
        target: [schema.secret.workspaceId, schema.secret.name],
        set: {
          configValue: config,
        },
      })
      .returning();
    if (!secret) {
      throw new Error("Failed to create secret");
    }
    await tx
      .insert(schema.workspaceMemberSetting)
      .values({
        workspaceId,
        workspaceMemberId,
        secretId: secret.id,
        name: config.type,
      })
      .onConflictDoNothing();
  });
}

export async function updateSecretWorkspaceMemberSettings<
  S extends WorkspaceMemberSettingSchema,
>({
  workspaceId,
  workspaceMemberId,
  update,
  name,
}: {
  workspaceId: string;
  workspaceMemberId: string;
  name: WorkspaceMemberSettingType;
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
    const settingsSchema = WorkspaceSettingSchemaRecord[name];
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

export async function getSecretWorkspaceSettingsResource({
  workspaceId,
  workspaceMemberId,
  name,
}: {
  workspaceId: string;
  workspaceMemberId: string;
  name: WorkspaceMemberSettingType;
}): Promise<Result<WorkspaceSettingsResource | null, Error>> {
  const settings = await db().query.workspaceMemberSetting.findFirst({
    where: and(
      eq(schema.workspaceMemberSetting.workspaceId, workspaceId),
      eq(schema.workspaceMemberSetting.workspaceMemberId, workspaceMemberId),
      eq(schema.workspaceMemberSetting.name, name),
    ),
    with: {
      secret: true,
    },
  });
  if (!settings?.secret) {
    return ok(null);
  }
  const settingsConfig = schemaValidateWithErr(
    settings.secret.configValue,
    WorkspaceSettingSchemaRecord[name],
  );
  if (settingsConfig.isErr()) {
    return null;
  }
}
