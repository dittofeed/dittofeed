import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { RoleEnum } from "isomorphic-lib/src/types";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { verifyMemberPassword } from "./memberPassword";
import { db } from "./db";
import * as schema from "./db/schema";
import {
  adminSetWorkspaceMemberPassword,
  createWorkspaceMemberRole,
  getMemberProfileWorkspaces,
  setOwnWorkspaceMemberPassword,
} from "./rbac";
import { createWorkspace } from "./workspaces";

describe("rbac member passwords", () => {
  it("sets password hash when initialPassword is provided", async () => {
    const workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `ws-${randomUUID()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const email = `${randomUUID()}@example.com`;
    await createWorkspaceMemberRole({
      workspaceId: workspace.id,
      email,
      role: RoleEnum.Viewer,
      initialPassword: "initialpass123",
    });
    const member = await db().query.workspaceMember.findFirst({
      where: eq(schema.workspaceMember.email, email),
    });
    expect(member?.passwordHash).toBeTruthy();
    expect(member?.emailVerified).toBe(true);
    await expect(
      verifyMemberPassword(member!.passwordHash, "initialpass123"),
    ).resolves.toBe(true);
  });

  it("leaves password hash null when initialPassword is omitted", async () => {
    const workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `ws-${randomUUID()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const email = `${randomUUID()}@example.com`;
    await createWorkspaceMemberRole({
      workspaceId: workspace.id,
      email,
      role: RoleEnum.Viewer,
    });
    const member = await db().query.workspaceMember.findFirst({
      where: eq(schema.workspaceMember.email, email),
    });
    expect(member?.passwordHash).toBeNull();
  });

  it("setOwnWorkspaceMemberPassword sets hash when none exists", async () => {
    const workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `ws-${randomUUID()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const email = `${randomUUID()}@example.com`;
    await createWorkspaceMemberRole({
      workspaceId: workspace.id,
      email,
      role: RoleEnum.Viewer,
    });
    const member = await db().query.workspaceMember.findFirst({
      where: eq(schema.workspaceMember.email, email),
    });
    expect(member).toBeTruthy();

    await setOwnWorkspaceMemberPassword({
      memberId: member!.id,
      newPassword: "firstpassword1",
    });

    const updated = await db().query.workspaceMember.findFirst({
      where: eq(schema.workspaceMember.id, member!.id),
    });
    await expect(
      verifyMemberPassword(updated!.passwordHash, "firstpassword1"),
    ).resolves.toBe(true);
  });

  it("setOwnWorkspaceMemberPassword requires current password when hash exists", async () => {
    const workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `ws-${randomUUID()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const email = `${randomUUID()}@example.com`;
    await createWorkspaceMemberRole({
      workspaceId: workspace.id,
      email,
      role: RoleEnum.Viewer,
      initialPassword: "oldpassword1",
    });
    const member = await db().query.workspaceMember.findFirst({
      where: eq(schema.workspaceMember.email, email),
    });
    expect(member).toBeTruthy();

    await expect(
      setOwnWorkspaceMemberPassword({
        memberId: member!.id,
        newPassword: "newpassword1",
      }),
    ).rejects.toThrow(/Current password is required/);

    await setOwnWorkspaceMemberPassword({
      memberId: member!.id,
      currentPassword: "oldpassword1",
      newPassword: "newpassword1",
    });
    const updated = await db().query.workspaceMember.findFirst({
      where: eq(schema.workspaceMember.id, member!.id),
    });
    await expect(
      verifyMemberPassword(updated!.passwordHash, "newpassword1"),
    ).resolves.toBe(true);
  });

  it("adminSetWorkspaceMemberPassword updates password for member in workspace", async () => {
    const workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `ws-${randomUUID()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const email = `${randomUUID()}@example.com`;
    await createWorkspaceMemberRole({
      workspaceId: workspace.id,
      email,
      role: RoleEnum.Viewer,
    });

    await adminSetWorkspaceMemberPassword({
      workspaceId: workspace.id,
      email,
      newPassword: "adminreset123",
    });

    const member = await db().query.workspaceMember.findFirst({
      where: eq(schema.workspaceMember.email, email),
    });
    expect(member?.emailVerified).toBe(true);
    await expect(
      verifyMemberPassword(member!.passwordHash, "adminreset123"),
    ).resolves.toBe(true);
  });

  it("getMemberProfileWorkspaces lists workspaces for the member", async () => {
    const workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `ws-${randomUUID()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const email = `${randomUUID()}@example.com`;
    await createWorkspaceMemberRole({
      workspaceId: workspace.id,
      email,
      role: RoleEnum.Author,
    });
    const member = await db().query.workspaceMember.findFirst({
      where: eq(schema.workspaceMember.email, email),
    });
    expect(member).toBeTruthy();

    const profile = await getMemberProfileWorkspaces(member!.id);
    expect(profile.email).toBe(email);
    expect(profile.hasPassword).toBe(false);
    expect(
      profile.workspaces.some((w) => w.workspaceId === workspace.id),
    ).toBe(true);
    const row = profile.workspaces.find((w) => w.workspaceId === workspace.id);
    expect(row?.role).toBe(RoleEnum.Author);
  });

  it("adminSetWorkspaceMemberPassword throws when member has no role in workspace", async () => {
    const ws1 = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `ws-${randomUUID()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const ws2 = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `ws-${randomUUID()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const email = `${randomUUID()}@example.com`;
    await createWorkspaceMemberRole({
      workspaceId: ws1.id,
      email,
      role: RoleEnum.Viewer,
    });

    await expect(
      adminSetWorkspaceMemberPassword({
        workspaceId: ws2.id,
        email,
        newPassword: "nope123456",
      }),
    ).rejects.toThrow(/Member role not found/);
  });
});
