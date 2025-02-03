import { aliasedTable, and, eq, max, not, or, sql } from "drizzle-orm";

import config from "../../../config";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import logger from "../../../logger";
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
  logger().info(
    {
      interval,
      now,
      limit,
    },
    "computePropertiesScheduler finding due workspaces",
  );

  const secondsInterval = `${Math.floor(interval / 1000).toString()} seconds`;
  const timestampNow = Math.floor(now / 1000);

  /**
   * Explanation:
   * - We select from `workspace w` (with an INNER JOIN on `feature` to ensure
   *   only those with `ComputePropertiesGlobal` enabled).
   * - We LEFT JOIN `computedPropertyPeriod` to pull the last period if it exists,
   *   but still keep the workspace even if no records exist (`NULL` aggregatedMax).
   * - We filter on w.status, w.type, feature.name, and feature.enabled, as before.
   * - In the HAVING clause, we check:
   *    (a) aggregatedMax IS NULL  => no computations ever run (cold start)
   *    (b) aggregatedMax is older than `interval`.
   * - Then we order by aggregatedMax ASC (nulls first) so that brand-new
   *   (never computed) workspaces appear first, then oldest computations after.
   */
  const periodsQuery = await db()
    .select({
      workspaceId: w.id,
      max: aggregatedMax,
    })
    .from(w)
    .innerJoin(schema.feature, eq(schema.feature.workspaceId, w.id))
    // Only left join on computedPropertyPeriod for step=ComputeAssignments
    .leftJoin(
      cpp,
      and(
        eq(cpp.workspaceId, w.id),
        eq(cpp.step, ComputedPropertyStep.ComputeAssignments),
      ),
    )
    .where(
      and(
        eq(w.status, WorkspaceStatusDbEnum.Active),
        not(eq(w.type, WorkspaceTypeAppEnum.Parent)),
        eq(schema.feature.name, FeatureNamesEnum.ComputePropertiesGlobal),
        eq(schema.feature.enabled, true),
      ),
    )
    .groupBy(w.id)
    .having(
      or(
        // Cold start: aggregatedMax is null => no existing compute records
        sql`${aggregatedMax} IS NULL`,
        // Overdue: last computation older than our interval
        sql`(to_timestamp(${timestampNow}) - ${aggregatedMax}) > ${secondsInterval}::interval`,
      ),
    )
    // Use `ASC nulls first` in some SQL dialects if needed, or rely on drizzle's `sql` expression
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
