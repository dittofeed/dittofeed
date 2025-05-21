import { randomUUID } from "crypto";
import { WorkspaceMemberSetting } from "isomorphic-lib/src/types";

import { db } from "./db";
import * as schema from "./db/schema";

function getSecretName(settingName: string) {
  return `workspace-member-setting-${settingName}`;
}

export async function writeSecretWorkspaceMemberSettings({
  workspaceId,
  workspaceMemberId,
  config,
}: {
  workspaceId: string;
  workspaceMemberId: string;
  config: WorkspaceMemberSetting;
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
