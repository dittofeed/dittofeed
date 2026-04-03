import { CompletionStatus, RoleEnum } from "isomorphic-lib/src/types";
import {
  getWorkspaceRole,
  requireWorkspaceAdmin,
  requireWorkspaceAtLeastRole,
  WORKSPACE_ROLE_INFO,
} from "isomorphic-lib/src/workspaceRoles";
import { useMemo } from "react";

import { useAppStorePick } from "./appStore";

export function useWorkspaceCapabilities(): {
  workspaceId: string | null;
  workspaceRoleLabel: string | null;
  isAdmin: boolean;
  isWorkspaceManagerOrAbove: boolean;
  isAuthorOrAbove: boolean;
} {
  const {
    authMode,
    memberRoles,
    workspace: workspaceResult,
  } = useAppStorePick(["authMode", "memberRoles", "workspace"]);

  const workspaceId =
    workspaceResult.type === CompletionStatus.Successful
      ? workspaceResult.value.id
      : null;

  return useMemo(() => {
    if (!workspaceId) {
      return {
        workspaceId: null,
        workspaceRoleLabel: null,
        isAdmin: false,
        isWorkspaceManagerOrAbove: false,
        isAuthorOrAbove: false,
      };
    }
    if (authMode !== "multi-tenant") {
      return {
        workspaceId,
        workspaceRoleLabel: null,
        isAdmin: true,
        isWorkspaceManagerOrAbove: true,
        isAuthorOrAbove: true,
      };
    }
    const ctx = { memberRoles, workspaceId };
    const role = getWorkspaceRole(memberRoles, workspaceId);
    const workspaceRoleLabel = role ? WORKSPACE_ROLE_INFO[role].label : null;
    return {
      workspaceId,
      workspaceRoleLabel,
      isAdmin: requireWorkspaceAdmin(ctx).isOk(),
      isWorkspaceManagerOrAbove: requireWorkspaceAtLeastRole({
        ...ctx,
        minimumRole: RoleEnum.WorkspaceManager,
      }).isOk(),
      isAuthorOrAbove: requireWorkspaceAtLeastRole({
        ...ctx,
        minimumRole: RoleEnum.Author,
      }).isOk(),
    };
  }, [authMode, memberRoles, workspaceId]);
}
