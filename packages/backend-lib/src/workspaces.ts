import { and, eq } from "drizzle-orm";
import { WORKSPACE_TOMBSTONE_PREFIX } from "isomorphic-lib/src/constants";
import { err, ok, Result } from "neverthrow";
import { validate as validateUuid } from "uuid";

import { bootstrapComputeProperties } from "./bootstrap";
import { terminateComputePropertiesWorkflow } from "./computedProperties/computePropertiesWorkflow/lifecycle";
import { db } from "./db";
import { workspace as dbWorkspace } from "./db/schema";
import { WorkspaceStatusDbEnum } from "./types";

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
  const result = await db().transaction(async (tx) => {
    const workspace = await tx.query.workspace.findFirst({
      where: eq(dbWorkspace.id, workspaceId),
    });
    if (!workspace) {
      return err({
        type: TombstoneWorkspaceErrorType.WorkspaceNotFound,
      });
    }
    if (workspace.status !== WorkspaceStatusDbEnum.Active) {
      return ok(undefined);
    }
    await tx
      .update(dbWorkspace)
      .set({
        name: `${WORKSPACE_TOMBSTONE_PREFIX}-${workspace.name}`,
        status: WorkspaceStatusDbEnum.Tombstoned,
      })
      .where(eq(dbWorkspace.id, workspaceId));
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
  const result = await db().transaction(async (tx) => {
    const workspace = await tx.query.workspace.findFirst({
      where: eq(dbWorkspace.id, workspaceId),
    });
    if (!workspace) {
      return err({
        type: ActivateTombstonedWorkspaceErrorType.WorkspaceNotFound,
      });
    }
    if (workspace.status !== WorkspaceStatusDbEnum.Tombstoned) {
      return ok(undefined);
    }
    const newName = workspace.name.replace(
      `${WORKSPACE_TOMBSTONE_PREFIX}-`,
      "",
    );
    await tx
      .update(dbWorkspace)
      .set({
        status: WorkspaceStatusDbEnum.Active,
        name: newName,
      })
      .where(eq(dbWorkspace.id, workspaceId));
    return ok(undefined);
  });
  if (result.isErr()) {
    return err(result.error);
  }
  await bootstrapComputeProperties({ workspaceId });
  return ok(undefined);
}

export { createWorkspace } from "./workspaces/createWorkspace";
