import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { insert } from "./db";
import { workspace as dbWorkspace } from "./db/schema";
import {
  createWorkspaceMemberRole,
  deleteWorkspaceMemberRole,
  getWorkspaceMemberRoles,
  updateWorkspaceMemberRole,
} from "./rbac";
import { RoleEnum, Workspace } from "./types";

describe("rbac", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    workspace = unwrap(
      await insert({
        table: dbWorkspace,
        values: {
          id: randomUUID(),
          name: `workspace-${randomUUID()}`,
          updatedAt: new Date(),
        },
      }),
    );
  });

  describe("last admin protection", () => {
    it("refuses to demote the only admin", async () => {
      const email = `${randomUUID()}@example.com`;
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        role: RoleEnum.Admin,
      });

      await expect(
        updateWorkspaceMemberRole({
          workspaceId: workspace.id,
          email,
          role: RoleEnum.Viewer,
        }),
      ).rejects.toThrow("last workspace admin");

      const { memberRoles } = await getWorkspaceMemberRoles({
        workspaceId: workspace.id,
      });
      expect(memberRoles[0]?.roles[0]?.role).toBe(RoleEnum.Admin);
    });

    it("allows demoting an admin when another admin remains", async () => {
      const demotedEmail = `${randomUUID()}@example.com`;
      const keptEmail = `${randomUUID()}@example.com`;
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email: demotedEmail,
        role: RoleEnum.Admin,
      });
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email: keptEmail,
        role: RoleEnum.Admin,
      });

      const updated = await updateWorkspaceMemberRole({
        workspaceId: workspace.id,
        email: demotedEmail,
        role: RoleEnum.Viewer,
      });
      expect(updated.role).toBe(RoleEnum.Viewer);
    });

    it("refuses to delete the only admin", async () => {
      const email = `${randomUUID()}@example.com`;
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        role: RoleEnum.Admin,
      });

      await expect(
        deleteWorkspaceMemberRole({
          workspaceId: workspace.id,
          email,
        }),
      ).rejects.toThrow("last workspace admin");

      const { memberRoles } = await getWorkspaceMemberRoles({
        workspaceId: workspace.id,
      });
      expect(memberRoles).toHaveLength(1);
    });

    it("allows deleting an admin when another admin remains", async () => {
      const deletedEmail = `${randomUUID()}@example.com`;
      const keptEmail = `${randomUUID()}@example.com`;
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email: deletedEmail,
        role: RoleEnum.Admin,
      });
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email: keptEmail,
        role: RoleEnum.Admin,
      });

      const deleted = await deleteWorkspaceMemberRole({
        workspaceId: workspace.id,
        email: deletedEmail,
      });
      expect(deleted).toBe(true);
    });
  });
});
