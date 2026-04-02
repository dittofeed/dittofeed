import {
  RoleEnum,
  WorkspaceMemberRoleResource,
} from "isomorphic-lib/src/types";
import {
  getWorkspaceRole,
  orderedWorkspaceRoles,
  requireWorkspaceAdmin,
  requireWorkspaceAtLeastRole,
} from "isomorphic-lib/src/workspaceRoles";

describe("workspaceRoles (isomorphic-lib)", () => {
  const rolesFor = (
    workspaceId: string,
    role: (typeof RoleEnum)[keyof typeof RoleEnum],
  ): WorkspaceMemberRoleResource[] => [
    {
      workspaceId,
      workspaceMemberId: "m1",
      workspaceName: "W",
      role,
    },
  ];

  it("orderedWorkspaceRoles returns strongest-first order", () => {
    expect(orderedWorkspaceRoles()).toEqual([
      RoleEnum.Admin,
      RoleEnum.WorkspaceManager,
      RoleEnum.Author,
      RoleEnum.Viewer,
    ]);
  });

  it("getWorkspaceRole returns null when missing", () => {
    expect(getWorkspaceRole([], "ws-1")).toBeNull();
  });

  it("getWorkspaceRole returns role for workspace", () => {
    expect(getWorkspaceRole(rolesFor("ws-1", RoleEnum.Author), "ws-1")).toEqual(
      RoleEnum.Author,
    );
  });

  it("requireWorkspaceAdmin succeeds for Admin", () => {
    expect(
      requireWorkspaceAdmin({
        memberRoles: rolesFor("ws-1", RoleEnum.Admin),
        workspaceId: "ws-1",
      }).isOk(),
    ).toBe(true);
  });

  it("requireWorkspaceAdmin fails for Viewer", () => {
    expect(
      requireWorkspaceAdmin({
        memberRoles: rolesFor("ws-1", RoleEnum.Viewer),
        workspaceId: "ws-1",
      }).isErr(),
    ).toBe(true);
  });

  it("requireWorkspaceAtLeastRole allows Author when minimum is Viewer", () => {
    expect(
      requireWorkspaceAtLeastRole({
        memberRoles: rolesFor("ws-1", RoleEnum.Author),
        workspaceId: "ws-1",
        minimumRole: RoleEnum.Viewer,
      }).isOk(),
    ).toBe(true);
  });

  it("requireWorkspaceAtLeastRole rejects Viewer when minimum is Author", () => {
    expect(
      requireWorkspaceAtLeastRole({
        memberRoles: rolesFor("ws-1", RoleEnum.Viewer),
        workspaceId: "ws-1",
        minimumRole: RoleEnum.Author,
      }).isErr(),
    ).toBe(true);
  });
});
