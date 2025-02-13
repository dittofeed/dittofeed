import { and, eq, inArray, not, or } from "drizzle-orm";
import { WORKSPACE_TOMBSTONE_PREFIX } from "isomorphic-lib/src/constants";
import { err, ok, Result } from "neverthrow";
import { validate as validateUuid } from "uuid";

import { bootstrapComputeProperties } from "./bootstrap";
import {
  startComputePropertiesWorkflow,
  stopComputePropertiesWorkflow,
  terminateComputePropertiesWorkflow,
} from "./computedProperties/computePropertiesWorkflow/lifecycle";
import { db } from "./db";
import {
  segment as dbSegment,
  userProperty as dbUserProperty,
  workspace as dbWorkspace,
} from "./db/schema";
import {
  Workspace,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "./types";

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

export async function pauseWorkspace({ workspaceId }: { workspaceId: string }) {
  await db()
    .update(dbWorkspace)
    .set({
      status: WorkspaceStatusDbEnum.Paused,
    })
    .where(eq(dbWorkspace.id, workspaceId));
  await stopComputePropertiesWorkflow({ workspaceId });
}

export async function resumeWorkspace({
  workspaceId,
}: {
  workspaceId: string;
}) {
  await db()
    .update(dbWorkspace)
    .set({
      status: WorkspaceStatusDbEnum.Active,
    })
    .where(eq(dbWorkspace.id, workspaceId));

  await startComputePropertiesWorkflow({ workspaceId });
}

export const RECOMPUTABLE_WORKSPACES_QUERY = and(
  eq(dbWorkspace.status, WorkspaceStatusDbEnum.Active),
  not(eq(dbWorkspace.type, WorkspaceTypeAppEnum.Parent)),
  or(
    inArray(
      dbWorkspace.id,
      db().select({ id: dbSegment.workspaceId }).from(dbSegment),
    ),
    inArray(
      dbWorkspace.id,
      db().select({ id: dbUserProperty.workspaceId }).from(dbUserProperty),
    ),
  ),
);

export async function getRecomputableWorkspaces(): Promise<Workspace[]> {
  const workspaces = await db().query.workspace.findMany({
    where: RECOMPUTABLE_WORKSPACES_QUERY,
  });
  return workspaces;
}
