import { CompletionStatus, RoleEnum } from "isomorphic-lib/src/types";
import {
  requireWorkspaceAdmin,
  requireWorkspaceAtLeastRole,
} from "isomorphic-lib/src/workspaceRoles";
import { useMemo } from "react";

import { useAppStorePick } from "./appStore";

export function useWorkspaceCapabilities(): {
  workspaceId: string | null;
  isAdmin: boolean;
  isWorkspaceManagerOrAbove: boolean;
  isAuthorOrAbove: boolean;
} {
  const { authMode, memberRoles, workspace: workspaceResult } = useAppStorePick(
    ["authMode", "memberRoles", "workspace"],
  );

  const workspaceId =
    workspaceResult.type === CompletionStatus.Successful
      ? workspaceResult.value.id
      : null;

  return useMemo(() => {
    if (!workspaceId) {
      return {
        workspaceId: null,
        isAdmin: false,
        isWorkspaceManagerOrAbove: false,
        isAuthorOrAbove: false,
      };
    }
    if (authMode !== "multi-tenant") {
      return {
        workspaceId,
        isAdmin: true,
        isWorkspaceManagerOrAbove: true,
        isAuthorOrAbove: true,
      };
    }
    const ctx = { memberRoles, workspaceId };
    return {
      workspaceId,
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
