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
        id: randomUUID(),
        name: randomUUID(),
        type: WorkspaceTypeAppEnum.Parent,
      }),
    );
    workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: randomUUID(),
        parentWorkspaceId: parentWorkspace.id,
        type: WorkspaceTypeAppEnum.Child,
      }),
    );
  });
  describe("writeSecretWorkspaceOccupantSettings", () => {
    describe("when writing the same setting for multiple occupants", () => {
      it("should not conflict with the setting for the other occupant", async () => {
        await writeSecretWorkspaceOccupantSettings({
          workspaceId: workspace.id,
          workspaceOccupantId: "occupant-id-1",
          occupantType: "ChildWorkspaceOccupant",
          config: {
            type: WorkspaceMemberSettingTypeEnum.GmailTokens,
            email: `occupant-id-1@example.com`,
            accessToken: randomUUID(),
            accessTokenIv: randomUUID(),
            accessTokenAuthTag: randomUUID(),
            refreshToken: randomUUID(),
            refreshTokenIv: randomUUID(),
          },
        });

        await writeSecretWorkspaceOccupantSettings({
          workspaceId: workspace.id,
          workspaceOccupantId: "occupant-id-2",
          occupantType: "ChildWorkspaceOccupant",
          config: {
            type: WorkspaceMemberSettingTypeEnum.GmailTokens,
            email: `occupant-id-2@example.com`,
            accessToken: randomUUID(),
            accessTokenIv: randomUUID(),
            accessTokenAuthTag: randomUUID(),
            refreshToken: randomUUID(),
            refreshTokenIv: randomUUID(),
          },
        });

        const settings1 = await getSecretWorkspaceSettingsResource({
          workspaceId: workspace.id,
          workspaceOccupantId: "occupant-id-1",
          name: WorkspaceMemberSettingTypeEnum.GmailTokens,
        });
        if (!settings1.isOk()) {
          throw settings1.error;
        }
        expect(settings1.value?.config).toEqual(
          expect.objectContaining({
            type: WorkspaceMemberSettingTypeEnum.GmailTokens,
            email: `occupant-id-1@example.com`,
          }),
        );

        const settings2 = await getSecretWorkspaceSettingsResource({
          workspaceId: workspace.id,
          workspaceOccupantId: "occupant-id-2",
          name: WorkspaceMemberSettingTypeEnum.GmailTokens,
        });
        if (!settings2.isOk()) {
          throw settings2.error;
        }
        expect(settings2.value?.config).toEqual(
          expect.objectContaining({
            type: WorkspaceMemberSettingTypeEnum.GmailTokens,
            email: `occupant-id-2@example.com`,
          }),
        );
      });
    });
  });
});
