import { err, Result } from "neverthrow";

import { isAuthorized } from "./auth";
import {
  Role,
  RoleEnum,
  WorkspaceMemberRoleResource,
} from "./types";

/** User-facing copy aligned with `authCodes` in auth.ts (strongest first). */
export const WORKSPACE_ROLE_INFO: Record<
  Role,
  { label: string; summary: string }
> = {
  [RoleEnum.Admin]: {
    label: "Admin",
    summary:
      "Full control: team and permissions, workspace settings, channels, keys, and all resources.",
  },
  [RoleEnum.WorkspaceManager]: {
    label: "Workspace manager",
    summary:
      "Manage workspace configuration, messaging channels, API keys, and operational settings. Intended for admins who should not need full org control.",
  },
  [RoleEnum.Author]: {
    label: "Author",
    summary:
      "Create and edit journeys, templates, segments, and broadcasts. No team or permission management.",
  },
  [RoleEnum.Viewer]: {
    label: "Viewer",
    summary:
      "Read-only access to dashboards and workspace resources. Cannot change settings or content.",
  },
};

const ROLE_ORDER: Role[] = [
  RoleEnum.Admin,
  RoleEnum.WorkspaceManager,
  RoleEnum.Author,
  RoleEnum.Viewer,
];

export function orderedWorkspaceRoles(): Role[] {
  return ROLE_ORDER;
}

export function getWorkspaceRole(
  memberRoles: WorkspaceMemberRoleResource[],
  workspaceId: string,
): Role | null {
  const row = memberRoles.find((r) => r.workspaceId === workspaceId);
  return row?.role ?? null;
}

/**
 * Ensures the member has at least `minimumRole` in `workspaceId` using the same
 * ordering as `isAuthorized` / `authCodes` (lower code = stronger).
 */
export function requireWorkspaceAtLeastRole({
  memberRoles,
  workspaceId,
  minimumRole,
}: {
  memberRoles: WorkspaceMemberRoleResource[];
  workspaceId: string;
  minimumRole: Role;
}): Result<null, Error> {
  const role = getWorkspaceRole(memberRoles, workspaceId);
  if (!role) {
    return err(new Error("No role in workspace"));
  }
  return isAuthorized({ userRole: role, requiredRole: minimumRole });
}

export function requireWorkspaceAdmin({
  memberRoles,
  workspaceId,
}: {
  memberRoles: WorkspaceMemberRoleResource[];
  workspaceId: string;
}): Result<null, Error> {
  return requireWorkspaceAtLeastRole({
    memberRoles,
    workspaceId,
    minimumRole: RoleEnum.Admin,
  });
}
