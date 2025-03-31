import { randomUUID } from "crypto";
import {
  aliasedTable,
  and,
  eq,
  inArray,
  lt,
  max,
  min,
  not,
  or,
  sql,
} from "drizzle-orm";
import { Overwrite } from "utility-types";

import config from "../config";
import { db } from "../db";
import * as schema from "../db/schema";
import {
  computedPropertyPeriod as dbComputedPropertyPeriod,
  segment as dbSegment,
  userProperty as dbUserProperty,
} from "../db/schema";
import logger from "../logger";
import {
  ComputedPropertyPeriod,
  ComputedPropertyStep,
  FeatureNamesEnum,
  SavedSegmentResource,
  SavedUserPropertyResource,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "../types";

export type AggregatedComputedPropertyPeriod = Omit<
  ComputedPropertyPeriod,
  "from" | "workspaceId" | "to"
> & {
  maxTo: string;
};

export type Period = Overwrite<
  Pick<
    AggregatedComputedPropertyPeriod,
    "maxTo" | "computedPropertyId" | "version"
  >,
  {
    maxTo: Date;
  }
>;

export type PeriodByComputedPropertyIdMap = Map<string, Period>;

export class PeriodByComputedPropertyId {
  readonly map: PeriodByComputedPropertyIdMap;

  static getKey({
    computedPropertyId,
    version,
  }: {
    computedPropertyId: string;
    version: string;
  }) {
    return `${computedPropertyId}-${version}`;
  }

  constructor(map: PeriodByComputedPropertyIdMap) {
    this.map = map;
  }

  get({
    computedPropertyId,
    version,
  }: {
    computedPropertyId: string;
    version: string;
  }): Period | undefined {
    const key = PeriodByComputedPropertyId.getKey({
      computedPropertyId,
      version,
    });
    const value = this.map.get(key);
    return value;
  }
}

export async function getPeriodsByComputedPropertyId({
  workspaceId,
  step,
}: {
  workspaceId: string;
  step: ComputedPropertyStep;
}): Promise<PeriodByComputedPropertyId> {
  const periods = (
    await db().execute<AggregatedComputedPropertyPeriod>(sql`
    SELECT DISTINCT ON (${dbComputedPropertyPeriod.workspaceId}, ${dbComputedPropertyPeriod.type}, ${dbComputedPropertyPeriod.computedPropertyId})
      ${dbComputedPropertyPeriod.type},
      ${dbComputedPropertyPeriod.computedPropertyId},
      ${dbComputedPropertyPeriod.version},
      MAX(${dbComputedPropertyPeriod.to}) OVER (
        PARTITION BY ${dbComputedPropertyPeriod.workspaceId}, ${dbComputedPropertyPeriod.type}, ${dbComputedPropertyPeriod.computedPropertyId}
      ) as ${sql.identifier("maxTo")}
    FROM ${dbComputedPropertyPeriod}
    WHERE
      ${dbComputedPropertyPeriod.workspaceId} = CAST(${workspaceId} AS UUID)
      AND ${dbComputedPropertyPeriod.step} = ${step}
    ORDER BY 
      ${dbComputedPropertyPeriod.workspaceId}, 
      ${dbComputedPropertyPeriod.type}, 
      ${dbComputedPropertyPeriod.computedPropertyId}, 
      ${dbComputedPropertyPeriod.to} DESC`)
  ).rows;

  const periodByComputedPropertyId =
    periods.reduce<PeriodByComputedPropertyIdMap>((acc, period) => {
      const { maxTo } = period;
      const key = PeriodByComputedPropertyId.getKey(period);
      acc.set(key, {
        maxTo: new Date(`${maxTo}+0000`),
        computedPropertyId: period.computedPropertyId,
        version: period.version,
      });
      return acc;
    }, new Map());

  return new PeriodByComputedPropertyId(periodByComputedPropertyId);
}

export async function createPeriods({
  workspaceId,
  userProperties,
  segments,
  now,
  periodByComputedPropertyId,
  step,
}: {
  step: ComputedPropertyStep;
  workspaceId: string;
  userProperties: SavedUserPropertyResource[];
  segments: SavedSegmentResource[];
  periodByComputedPropertyId?: PeriodByComputedPropertyId;
  now: number;
}) {
  const nowD = new Date(now);
  const newPeriods: (typeof dbComputedPropertyPeriod.$inferInsert)[] = [];

  for (const segment of segments) {
    const version = segment.definitionUpdatedAt.toString();
    const previousPeriod = periodByComputedPropertyId?.get({
      version,
      computedPropertyId: segment.id,
    });
    newPeriods.push({
      id: randomUUID(),
      workspaceId,
      step,
      type: "Segment",
      computedPropertyId: segment.id,
      from: previousPeriod ? previousPeriod.maxTo : null,
      to: nowD,
      version,
      createdAt: nowD,
    });
  }

  for (const userProperty of userProperties) {
    const version = userProperty.definitionUpdatedAt.toString();
    const previousPeriod = periodByComputedPropertyId?.get({
      version,
      computedPropertyId: userProperty.id,
    });
    newPeriods.push({
      id: randomUUID(),
      workspaceId,
      step,
      type: "UserProperty",
      computedPropertyId: userProperty.id,
      from: previousPeriod ? previousPeriod.maxTo : null,
      to: nowD,
      version,
      createdAt: nowD,
    });
  }

  await db().transaction(async (tx) => {
    logger().debug({ newPeriods }, "Creating periods");
    await tx
      .insert(dbComputedPropertyPeriod)
      .values(newPeriods)
      .onConflictDoNothing();
    // FIXME periods aren't deleting?
    logger().debug("Deleted periods");
    await tx
      .delete(dbComputedPropertyPeriod)
      .where(
        and(
          eq(dbComputedPropertyPeriod.workspaceId, workspaceId),
          eq(dbComputedPropertyPeriod.step, step),
          lt(dbComputedPropertyPeriod.to, new Date(now - 60 * 1000 * 5)),
        ),
      );
  });
}

const EARLIEST_COMPUTE_PROPERTY_STEP = ComputedPropertyStep.ComputeAssignments;

export async function getEarliestComputePropertyPeriod({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<number> {
  const maxPerComputedProperty = db()
    .select({
      type: dbComputedPropertyPeriod.type,
      computedPropertyId: dbComputedPropertyPeriod.computedPropertyId,
      maxTo: max(dbComputedPropertyPeriod.to).as("maxTo"),
    })
    .from(dbComputedPropertyPeriod)
    .leftJoin(
      dbSegment,
      and(
        eq(dbComputedPropertyPeriod.computedPropertyId, dbSegment.id),
        eq(dbComputedPropertyPeriod.type, "Segment"),
      ),
    )
    .leftJoin(
      dbUserProperty,
      and(
        eq(dbComputedPropertyPeriod.computedPropertyId, dbUserProperty.id),
        eq(dbComputedPropertyPeriod.type, "UserProperty"),
      ),
    )
    .where(
      and(
        eq(dbComputedPropertyPeriod.workspaceId, workspaceId),
        eq(dbComputedPropertyPeriod.step, EARLIEST_COMPUTE_PROPERTY_STEP),
        eq(
          dbComputedPropertyPeriod.version,
          sql`round(extract(epoch from COALESCE(${dbSegment.definitionUpdatedAt}, ${dbUserProperty.definitionUpdatedAt})) * 1000)::text`,
        ),
      ),
    )
    .groupBy(
      dbComputedPropertyPeriod.type,
      dbComputedPropertyPeriod.computedPropertyId,
    )
    .as("maxPerComputedProperty");

  const result = await db()
    .select({
      minTo: min(maxPerComputedProperty.maxTo),
    })
    .from(maxPerComputedProperty);
  logger().debug({ result }, "Earliest computed property period");

  const minTo = result[0]?.minTo
    ? new Date(`${result[0].minTo}+0000`).getTime()
    : null;
  if (!minTo) {
    logger().error(
      {
        result,
        workspaceId,
        step: EARLIEST_COMPUTE_PROPERTY_STEP,
      },
      "No computed property periods found",
    );
    return 0;
  }
  return minTo;
}

export interface FindDueWorkspacesParams {
  // unix timestamp in ms
  now: number;
  interval?: number;
  limit?: number;
}

export async function findDueWorkspaceMaxTos({
  now,
  interval = config().computePropertiesInterval,
  limit = 100,
}: FindDueWorkspacesParams): Promise<
  { max: Date | null; workspaceId: string }[]
> {
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
        or(
          inArray(
            w.id,
            db().select({ id: dbSegment.workspaceId }).from(dbSegment),
          ),
          inArray(
            w.id,
            db()
              .select({ id: dbUserProperty.workspaceId })
              .from(dbUserProperty),
          ),
        ),
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
    .orderBy(sql`${aggregatedMax} ASC NULLS FIRST`)
    .limit(limit);

  return periodsQuery;
}
