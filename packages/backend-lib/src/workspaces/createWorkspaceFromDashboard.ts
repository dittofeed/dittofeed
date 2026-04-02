import { err, ok, Result } from "neverthrow";

import {
  bootstrapPostgres,
  bootstrapWorkspaceAfterPostgres,
} from "../bootstrap";
import logger from "../logger";
import { createWorkspaceMemberRole } from "../rbac";
import {
  CreateWorkspaceError,
  CreateWorkspaceErrorType,
  RoleEnum,
  WorkspaceTypeAppEnum,
} from "../types";

export async function createWorkspaceFromDashboard({
  workspaceName,
  workspaceDomain,
  creatorEmail,
}: {
  workspaceName: string;
  workspaceDomain?: string;
  creatorEmail: string;
}): Promise<Result<{ id: string; name: string }, CreateWorkspaceError>> {
  const trimmedName = workspaceName.trim();
  if (!trimmedName) {
    return err({
      type: CreateWorkspaceErrorType.WorkspaceNameViolation,
      message: "Workspace name is required",
    });
  }

  const trimmedDomain = workspaceDomain?.trim();
  const pg = await bootstrapPostgres({
    workspaceName: trimmedName,
    workspaceDomain:
      trimmedDomain && trimmedDomain.length > 0 ? trimmedDomain : undefined,
    workspaceType: WorkspaceTypeAppEnum.Root,
  });

  if (pg.isErr()) {
    return err(pg.error);
  }

  const { id: workspaceId, name } = pg.value;

  try {
    await bootstrapWorkspaceAfterPostgres({ workspaceId });
  } catch (e) {
    logger().error(
      { err: e, workspaceId },
      "createWorkspaceFromDashboard: bootstrapWorkspaceAfterPostgres failed",
    );
    throw e;
  }

  await createWorkspaceMemberRole({
    workspaceId,
    email: creatorEmail.trim(),
    role: RoleEnum.Admin,
  });

  return ok({ id: workspaceId, name });
}
