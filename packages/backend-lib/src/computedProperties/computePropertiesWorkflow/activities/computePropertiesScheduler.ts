import { sql } from "drizzle-orm";

import config from "../../../config";
import { db } from "../../../db";
import connectClient from "../../../temporal/client";
import { WorkspaceQueueItemType } from "../../../types";
import {
  COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
  computePropertiesQueueWorkflow,
  getQueueSizeQuery,
} from "../../computePropertiesQueueWorkflow";
import {
  findDueWorkspaceMaxTos,
  findDueWorkspaceMinTos,
  FindDueWorkspacesParams,
} from "../../periods";

function timestampToMillis(value: Date | string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export async function findDueWorkspaces(
  params: FindDueWorkspacesParams,
): Promise<{ workspaceIds: string[] }> {
  const maxTos = await findDueWorkspaceMaxTos(params);
  return {
    workspaceIds: maxTos.map(({ workspaceId }) => workspaceId),
  };
}

export interface DueWorkspace {
  id: string;
  maxPeriod?: number;
}

export async function findDueWorkspacesV2(
  params: FindDueWorkspacesParams,
): Promise<{ workspaces: DueWorkspace[] }> {
  const maxTos = await findDueWorkspaceMaxTos(params);
  return {
    workspaces: maxTos.map(({ workspaceId, max }) => ({
      id: workspaceId,
      maxPeriod: timestampToMillis(max),
    })),
  };
}

export async function getQueueSize(): Promise<number> {
  const client = await connectClient();
  const handle = client.workflow.getHandle<
    typeof computePropertiesQueueWorkflow
  >(COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID);
  return handle.query(getQueueSizeQuery);
}

export interface DueWorkspaceV3 {
  id: string;
  period?: number;
}

export async function findDueWorkspacesV3(
  params: FindDueWorkspacesParams,
): Promise<{ workspaces: DueWorkspaceV3[] }> {
  const minTos = await findDueWorkspaceMinTos(params);
  return {
    workspaces: minTos.map(({ workspaceId, min }) => ({
      id: workspaceId,
      period: timestampToMillis(min),
    })),
  };
}

export async function findDueUserPropertyItems({
  now,
  interval,
  limit = 500,
}: FindDueWorkspacesParams): Promise<{
  workspaces: {
    type: typeof WorkspaceQueueItemType.Batch;
    workspaceId: string;
    items: {
      type: typeof WorkspaceQueueItemType.UserProperty;
      workspaceId: string;
      id: string;
      period?: number;
    }[];
  }[];
}> {
  const resolvedInterval = interval ?? config().computePropertiesInterval;
  const secondsInterval = `${Math.floor(resolvedInterval / 1000).toString()} seconds`;
  const timestampNow = Math.floor(now / 1000);
  const rows = await db().execute<{
    workspace_id: string;
    user_property_id: string;
    latest_to: Date | string | null;
  }>(sql`
    WITH latest AS (
      SELECT
        "workspaceId",
        "computedPropertyId",
        version,
        MAX("to") AS latest_to
      FROM "ComputedPropertyPeriod"
      WHERE type = 'UserProperty'
        AND step = 'ComputeAssignments'
      GROUP BY "workspaceId", "computedPropertyId", version
    )
    SELECT
      up."workspaceId"::text AS workspace_id,
      up.id::text AS user_property_id,
      latest.latest_to
    FROM "UserProperty" up
    INNER JOIN "Workspace" w ON w.id = up."workspaceId"
    LEFT JOIN latest
      ON latest."workspaceId" = up."workspaceId"
      AND latest."computedPropertyId" = up.id
      AND latest.version = round(extract(epoch from up."definitionUpdatedAt") * 1000)::text
    WHERE up.status = 'Running'
      AND w.status = 'Active'
      AND w.type != 'Parent'
      AND (
        latest.latest_to IS NULL
        OR (to_timestamp(${timestampNow}) - latest.latest_to) > ${secondsInterval}::interval
      )
    ORDER BY latest.latest_to ASC NULLS FIRST
    LIMIT ${limit}
  `);

  const byWorkspace = new Map<
    string,
    {
      type: typeof WorkspaceQueueItemType.Batch;
      workspaceId: string;
      items: {
        type: typeof WorkspaceQueueItemType.UserProperty;
        workspaceId: string;
        id: string;
        period?: number;
      }[];
    }
  >();
  for (const row of rows.rows) {
    const item = byWorkspace.get(row.workspace_id) ?? {
      type: WorkspaceQueueItemType.Batch,
      workspaceId: row.workspace_id,
      items: [],
    };
    item.items.push({
      type: WorkspaceQueueItemType.UserProperty,
      workspaceId: row.workspace_id,
      id: row.user_property_id,
      period: timestampToMillis(row.latest_to),
    });
    byWorkspace.set(row.workspace_id, item);
  }
  return { workspaces: [...byWorkspace.values()] };
}
