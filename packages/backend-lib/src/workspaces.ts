import { and, asc, eq, inArray, not, or } from "drizzle-orm";
import { WORKSPACE_TOMBSTONE_PREFIX } from "isomorphic-lib/src/constants";
import { err, ok, Result } from "neverthrow";
import { validate as validateUuid } from "uuid";

import { bootstrapComputeProperties } from "./bootstrap";
import {
  startComputePropertiesWorkflow,
  stopComputePropertiesWorkflow,
  terminateComputePropertiesWorkflow,
} from "./computedProperties/computePropertiesWorkflow/lifecycle";
import { db, PostgresError, txQueryResult } from "./db";
import {
  segment as dbSegment,
  userProperty as dbUserProperty,
  workspace as dbWorkspace,
} from "./db/schema";
import { ClickHouseQueryBuilder, command as chCommand } from "./clickhouse";
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
    const externalId = workspace.externalId
      ? `${WORKSPACE_TOMBSTONE_PREFIX}-${workspace.externalId}`
      : undefined;

    await tx
      .update(dbWorkspace)
      .set({
        name: `${WORKSPACE_TOMBSTONE_PREFIX}-${workspace.name}`,
        externalId,
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
  WorkspaceConflict = "WorkspaceConflict",
}
export interface ActivateTombstonedWorkspaceNotFoundError {
  type: ActivateTombstonedWorkspaceErrorType.WorkspaceNotFound;
}

export interface ActivateTombstonedWorkspaceConflictError {
  type: ActivateTombstonedWorkspaceErrorType.WorkspaceConflict;
}

export type ActivateTombstonedWorkspaceError =
  | ActivateTombstonedWorkspaceNotFoundError
  | ActivateTombstonedWorkspaceConflictError;

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
    const newExternalId = workspace.externalId?.replace(
      `${WORKSPACE_TOMBSTONE_PREFIX}-`,
      "",
    );
    const updateResult = await txQueryResult(
      tx
        .update(dbWorkspace)
        .set({
          status: WorkspaceStatusDbEnum.Active,
          name: newName,
          externalId: newExternalId,
        })
        .where(eq(dbWorkspace.id, workspaceId)),
    );
    if (updateResult.isErr()) {
      if (
        updateResult.error.code === PostgresError.UNIQUE_VIOLATION ||
        updateResult.error.code === PostgresError.FOREIGN_KEY_VIOLATION
      ) {
        return err({
          type: ActivateTombstonedWorkspaceErrorType.WorkspaceConflict,
        });
      }
      throw new Error(
        `Unexpected error in activateTombstonedWorkspace: ${updateResult.error.code}`,
      );
    }
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

// Move workspace user events and related CH data to cold storage (local table placeholder)
export async function coldStoreWorkspaceEvents({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const qb = new ClickHouseQueryBuilder();
  const ws = qb.addQueryValue(workspaceId, "String");

  // Copy events to cold storage
  await chCommand({
    query: `
      INSERT INTO user_events_cold_storage (message_raw, processing_time, workspace_id, message_id, server_time)
      SELECT message_raw, processing_time, workspace_id, message_id, server_time
      FROM user_events_v2
      WHERE workspace_id = ${ws}
    `,
    query_params: qb.getQueries(),
  });

  // Delete hot data (async deletes)
  await Promise.all([
    chCommand({
      query: `DELETE FROM user_events_v2 WHERE workspace_id = ${ws} settings mutations_sync = 0, lightweight_deletes_sync = 0;`,
      query_params: qb.getQueries(),
    }),
    chCommand({
      query: `DELETE FROM internal_events WHERE workspace_id = ${ws} settings mutations_sync = 0, lightweight_deletes_sync = 0;`,
      query_params: qb.getQueries(),
    }),
  ]);
}

// Restore workspace user events and related CH data from cold storage (local table placeholder)
export async function restoreWorkspaceEvents({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const qb = new ClickHouseQueryBuilder();
  const ws = qb.addQueryValue(workspaceId, "String");

  // Restore from cold storage into hot table; MV will repopulate internal_events
  await chCommand({
    query: `
      INSERT INTO user_events_v2 (message_raw, processing_time, workspace_id, message_id, server_time)
      SELECT message_raw, processing_time, workspace_id, message_id, server_time
      FROM user_events_cold_storage
      WHERE workspace_id = ${ws}
    `,
    query_params: qb.getQueries(),
  });

  // Clear cold storage for this workspace (async)
  await chCommand({
    // NOTE: S3 engine does not support DELETE. We leave cold copies in object storage for now.
    // TODO: remove objects via S3 API once integrated.
    query: `SELECT 1`,
    query_params: qb.getQueries(),
  });
}

export function recomputableWorkspacesQuery() {
  return and(
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
}

export async function getRecomputableWorkspaces(): Promise<Workspace[]> {
  const workspaces = await db().query.workspace.findMany({
    where: recomputableWorkspacesQuery(),
    orderBy: [asc(dbWorkspace.createdAt)],
  });
  return workspaces;
}
