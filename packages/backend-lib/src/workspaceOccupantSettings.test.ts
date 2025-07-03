import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import {
  Workspace,
  WorkspaceMemberSettingTypeEnum,
  WorkspaceTypeAppEnum,
} from "./types";
import {
  getSecretWorkspaceSettingsResource,
  writeSecretWorkspaceOccupantSettings,
} from "./workspaceOccupantSettings";
import { createWorkspace } from "./workspaces";

describe("workspaceOccupantSettings", () => {
  let workspace: Workspace;
  beforeEach(async () => {
    const parentWorkspace = unwrap(
      await createWorkspace({
        name: randomUUID(),
        type: WorkspaceTypeAppEnum.Parent,
      }),
    );
    workspace = unwrap(
      await createWorkspace({
        name: randomUUID(),
        parentWorkspaceId: parentWorkspace.id,
        type: WorkspaceTypeAppEnum.Child,
      }),
    );
  });
  describe("writeSecretWorkspaceOccupantSettings", () => {
    describe("when writing the same setting for multiple occupants", () => {
      let occupantId1: string;
      let occupantId2: string;
      it("should not conflict with the setting for the other occupant", async () => {
        occupantId1 = "occupant-id-1";
        occupantId2 = "occupant-id-2";
        await writeSecretWorkspaceOccupantSettings({
          workspaceId: workspace.id,
          workspaceOccupantId: occupantId1,
          occupantType: "ChildWorkspaceOccupant",
          config: {
            type: WorkspaceMemberSettingTypeEnum.GmailTokens,
            email: `${occupantId1}@example.com`,
            accessToken: randomUUID(),
            accessTokenIv: randomUUID(),
            accessTokenAuthTag: randomUUID(),
            refreshToken: randomUUID(),
            refreshTokenIv: randomUUID(),
          },
        });

        await writeSecretWorkspaceOccupantSettings({
          workspaceId: workspace.id,
          workspaceOccupantId: occupantId2,
          occupantType: "ChildWorkspaceOccupant",
          config: {
            type: WorkspaceMemberSettingTypeEnum.GmailTokens,
            email: `${occupantId2}@example.com`,
            accessToken: randomUUID(),
            accessTokenIv: randomUUID(),
            accessTokenAuthTag: randomUUID(),
            refreshToken: randomUUID(),
            refreshTokenIv: randomUUID(),
          },
        });

        const settings1 = await getSecretWorkspaceSettingsResource({
          workspaceId: workspace.id,
          workspaceOccupantId: occupantId1,
          name: WorkspaceMemberSettingTypeEnum.GmailTokens,
        });
        if (!settings1.isOk()) {
          throw settings1.error;
        }
        expect(settings1.value?.config).toEqual(
          expect.objectContaining({
            type: WorkspaceMemberSettingTypeEnum.GmailTokens,
            email: `${occupantId1}@example.com`,
          }),
        );

        const settings2 = await getSecretWorkspaceSettingsResource({
          workspaceId: workspace.id,
          workspaceOccupantId: occupantId2,
          name: WorkspaceMemberSettingTypeEnum.GmailTokens,
        });
        if (!settings2.isOk()) {
          throw settings2.error;
        }
        expect(settings2.value?.config).toEqual(
          expect.objectContaining({
            type: WorkspaceMemberSettingTypeEnum.GmailTokens,
            email: `${occupantId2}@example.com`,
          }),
        );
      });
    });
  });
});
