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

  describe("createWorkspaceMemberRole", () => {
    it("defaults unmaskPii to false", async () => {
      const email = `${randomUUID()}@example.com`;
      const role = await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        role: RoleEnum.Viewer,
      });

      expect(role.unmaskPii).toBe(false);
    });

    it("persists an explicitly granted unmaskPii permission", async () => {
      const email = `${randomUUID()}@example.com`;
      const created = await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        role: RoleEnum.Viewer,
        unmaskPii: true,
      });
      expect(created.unmaskPii).toBe(true);

      const { memberRoles } = await getWorkspaceMemberRoles({
        workspaceId: workspace.id,
      });
      const member = memberRoles.find((m) => m.member.email === email);
      expect(member?.roles[0]?.unmaskPii).toBe(true);
    });
  });

  describe("updateWorkspaceMemberRole", () => {
    it("changes only the unmaskPii permission", async () => {
      const email = `${randomUUID()}@example.com`;
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        role: RoleEnum.Author,
      });

      const updated = await updateWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        unmaskPii: true,
      });

      expect(updated.unmaskPii).toBe(true);
      expect(updated.role).toBe(RoleEnum.Author);
    });

    it("changes only the role", async () => {
      const email = `${randomUUID()}@example.com`;
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        role: RoleEnum.Viewer,
        unmaskPii: true,
      });

      const updated = await updateWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        role: RoleEnum.WorkspaceManager,
      });

      expect(updated.role).toBe(RoleEnum.WorkspaceManager);
      expect(updated.unmaskPii).toBe(true);
    });

    it("can revoke a previously granted permission", async () => {
      const email = `${randomUUID()}@example.com`;
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        role: RoleEnum.Viewer,
        unmaskPii: true,
      });

      const updated = await updateWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        unmaskPii: false,
      });

      expect(updated.unmaskPii).toBe(false);
    });
  });

  describe("getWorkspaceMemberRoles", () => {
    it("exposes unmaskPii for every role", async () => {
      const grantedEmail = `${randomUUID()}@example.com`;
      const deniedEmail = `${randomUUID()}@example.com`;
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email: grantedEmail,
        role: RoleEnum.Admin,
        unmaskPii: true,
      });
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email: deniedEmail,
        role: RoleEnum.Admin,
      });

      const { memberRoles } = await getWorkspaceMemberRoles({
        workspaceId: workspace.id,
      });

      const granted = memberRoles.find((m) => m.member.email === grantedEmail);
      const denied = memberRoles.find((m) => m.member.email === deniedEmail);
      expect(granted?.roles[0]?.unmaskPii).toBe(true);
      expect(denied?.roles[0]?.unmaskPii).toBe(false);
    });
  });

  describe("deleteWorkspaceMemberRole", () => {
    it("removes the role and its permission", async () => {
      const email = `${randomUUID()}@example.com`;
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        role: RoleEnum.Viewer,
        unmaskPii: true,
      });

      const deleted = await deleteWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
      });
      expect(deleted).toBe(true);

      const { memberRoles } = await getWorkspaceMemberRoles({
        workspaceId: workspace.id,
      });
      expect(memberRoles.find((m) => m.member.email === email)).toBeUndefined();
    });
  });
});
