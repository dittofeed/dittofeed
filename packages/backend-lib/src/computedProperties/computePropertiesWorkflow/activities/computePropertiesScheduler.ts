import { aliasedTable, and, eq, max, not, sql } from "drizzle-orm";

import config from "../../../config";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import connectClient from "../../../temporal/client";
import {
  ComputedPropertyStep,
  FeatureNamesEnum,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "../../../types";
import {
  COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
  computePropertiesQueueWorkflow,
  getQueueSizeQuery,
} from "../../computePropertiesQueueWorkflow";

export async function findDueWorkspaces({
  now,
  interval = config().computePropertiesInterval,
  limit = 100,
}: {
  // unix timestamp in ms
  now: number;
  interval?: number;
  limit?: number;
}): Promise<{ workspaceIds: string[] }> {
  const w = aliasedTable(schema.workspace, "w");
  const cpp = aliasedTable(schema.computedPropertyPeriod, "cpp");
  const aggregatedMax = max(cpp.to);

  const secondsInterval = `${Math.floor(interval / 1000).toString()} seconds`;
  const timestampNow = Math.floor(now / 1000);
  const periodsQuery = await db()
    .select({
      workspaceId: cpp.workspaceId,
      max: aggregatedMax,
    })
    .from(cpp)
    .innerJoin(w, eq(cpp.workspaceId, w.id))
    .innerJoin(schema.feature, eq(schema.feature.workspaceId, w.id))
    .where(
      and(
        eq(cpp.step, ComputedPropertyStep.ComputeAssignments),
        eq(w.status, WorkspaceStatusDbEnum.Active),
        not(eq(w.type, WorkspaceTypeAppEnum.Parent)),
        eq(schema.feature.name, FeatureNamesEnum.ComputePropertiesGlobal),
        eq(schema.feature.enabled, true),
      ),
    )
    .groupBy(cpp.workspaceId)
    .having(
      sql`(to_timestamp(${timestampNow}) - ${aggregatedMax}) > ${secondsInterval}::interval`,
    )
    .orderBy(sql`${aggregatedMax} ASC`)
    .limit(limit);

  return {
    workspaceIds: periodsQuery.map(({ workspaceId }) => workspaceId),
  };
}

export async function getQueueSize(): Promise<number> {
  const client = await connectClient();
  const handle = client.workflow.getHandle<
    typeof computePropertiesQueueWorkflow
  >(COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID);
  return handle.query(getQueueSizeQuery);
}
