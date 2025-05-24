import { Static } from "@sinclair/typebox";
import { and, eq } from "drizzle-orm";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  WorkspaceMemberSetting,
  WorkspaceMemberSettingSchema,
  WorkspaceMemberSettingType,
  WorkspaceSettingSchemaRecord,
  WorkspaceSettingsResource,
} from "isomorphic-lib/src/types";
import { err, ok, Result } from "neverthrow";

import { db } from "./db";
import * as schema from "./db/schema";
import logger from "./logger";
import { DBWorkspaceOccupantType } from "./types";

function getSecretName(settingName: string) {
  return `workspace-occupant-setting-${settingName}`;
}

export async function writeSecretWorkspaceOccupantSettings<
  T extends WorkspaceMemberSetting,
>({
  workspaceId,
  workspaceOccupantId,
  config,
  occupantType,
}: {
  workspaceId: string;
  workspaceOccupantId: string;
  occupantType: "WorkspaceMember" | "ChildWorkspaceOccupant";
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
      .insert(schema.workspaceOccupantSetting)
      .values({
        workspaceId,
        workspaceOccupantId,
        secretId: secret.id,
        name: config.type,
        occupantType,
      })
      .onConflictDoNothing();
  });
}

export async function updateSecretWorkspaceOccupantSettings<
  S extends WorkspaceMemberSettingSchema,
>({
  workspaceId,
  workspaceOccupantId,
  update,
  name,
}: {
  workspaceId: string;
  workspaceOccupantId: string;
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
          workspaceOccupantId,
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
  workspaceOccupantId,
  name,
}: {
  workspaceId: string;
  workspaceOccupantId: string;
  name: WorkspaceMemberSettingType;
}): Promise<Result<WorkspaceSettingsResource | null, Error>> {
  const settings = await db().query.workspaceOccupantSetting.findFirst({
    where: and(
      eq(schema.workspaceOccupantSetting.workspaceId, workspaceId),
      eq(
        schema.workspaceOccupantSetting.workspaceOccupantId,
        workspaceOccupantId,
      ),
      eq(schema.workspaceOccupantSetting.name, name),
      eq(schema.workspaceOccupantSetting.occupantType, "WorkspaceMember"),
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
    return err(settingsConfig.error);
  }
  return ok({
    workspaceId,
    name,
    config: settingsConfig.value,
  });
}

export function isWorkspaceOccupantType(
  type: string,
): type is DBWorkspaceOccupantType {
  return type === "WorkspaceMember" || type === "ChildWorkspaceOccupant";
}
