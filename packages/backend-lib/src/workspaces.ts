import { WorkspaceStatus } from "@prisma/client";
import { WORKSPACE_TOMBSTONE_PREFIX } from "isomorphic-lib/src/constants";
import { err, ok, Result } from "neverthrow";
import { validate as validateUuid } from "uuid";

import {
  startComputePropertiesWorkflow,
  terminateComputePropertiesWorkflow,
} from "./computedProperties/computePropertiesWorkflow/lifecycle";
import prisma from "./prisma";

export enum TombstoneWorkspaceErrorType {
  WorkspaceNotFound = "WorkspaceNotFound",
}
export interface TombstoneWorkspaceError {
  type: TombstoneWorkspaceErrorType.WorkspaceNotFound;
}

export async function tombstoneWorkspace(
  workspaceId: string,
): Promise<Result<void, TombstoneWorkspaceError>> {
  if (!validateUuid(workspaceId)) {
    return err({
      type: TombstoneWorkspaceErrorType.WorkspaceNotFound,
    });
  }
  const result = await prisma().$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      return err({
        type: TombstoneWorkspaceErrorType.WorkspaceNotFound,
      });
    }
    if (workspace.status !== WorkspaceStatus.Active) {
      return ok(undefined);
    }
    await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        name: `${WORKSPACE_TOMBSTONE_PREFIX}-${workspace.name}`,
        status: "Tombstoned",
      },
    });
    return ok(undefined);
  });
  if (result.isErr()) {
    return err(result.error);
  }
  await terminateComputePropertiesWorkflow({ workspaceId });
  return ok(undefined);
}

export enum ActivateTombstonedWorkspaceErrorType {
  WorkspaceNotFound = "WorkspaceNotFound",
}
export interface ActivateTombstonedWorkspaceError {
  type: ActivateTombstonedWorkspaceErrorType.WorkspaceNotFound;
}

export async function activateTombstonedWorkspace(
  workspaceId: string,
): Promise<Result<void, ActivateTombstonedWorkspaceError>> {
  const result = await prisma().$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      return err({
        type: ActivateTombstonedWorkspaceErrorType.WorkspaceNotFound,
      });
    }
    if (workspace.status !== WorkspaceStatus.Tombstoned) {
      return ok(undefined);
    }
    const newName = workspace.name.replace(
      `${WORKSPACE_TOMBSTONE_PREFIX}-`,
      "",
    );
    await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        status: WorkspaceStatus.Active,
        name: newName,
      },
    });
    return ok(undefined);
  });
  if (result.isErr()) {
    return err(result.error);
  }
  await startComputePropertiesWorkflow({ workspaceId });
  return ok(undefined);
}
