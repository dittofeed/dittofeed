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
  SQL,
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
import { getFeature } from "../features";
import logger from "../logger";
import {
  ComputedPropertyPeriod,
  ComputedPropertyStep,
  ComputedPropertyStepEnum,
  FeatureNamesEnum,
  GetComputedPropertyPeriodsRequest,
  GetComputedPropertyPeriodsResponse,
  SavedSegmentResource,
  SavedUserPropertyResource,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "../types";
import {
  signalAddWorkspacesV2,
  signalComputePropertiesEarly,
} from "./computePropertiesWorkflow/lifecycle";

export type AggregatedComputedPropertyPeriod = Omit<
  ComputedPropertyPeriod,
  "from" | "workspaceId" | "to"
> & {
  maxTo: string;
};

export type Period = Overwrite<
  Pick<
    AggregatedComputedPropertyPeriod,
    "maxTo" | "computedPropertyId" | "version" | "type"
  >,
  {
    maxTo: Date;
  }
>;

export type PeriodByComputedPropertyIdMap = Map<string, Period>;

export class PeriodByComputedPropertyId {
  readonly map: PeriodByComputedPropertyIdMap;

  readonly versionsById: Map<string, Set<string>>;

  static getKey({
    computedPropertyId,
    version,
  }: {
    computedPropertyId: string;
    version: string;
  }) {
    return `${computedPropertyId}-${version}`;
  }

  constructor() {
    this.map = new Map();
    this.versionsById = new Map();
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

  set({
    computedPropertyId,
    version,
    period,
  }: {
    computedPropertyId: string;
    version: string;
    period: Period;
  }) {
    this.map.set(
      PeriodByComputedPropertyId.getKey({ computedPropertyId, version }),
      period,
    );
    const existingVersions =
      this.versionsById.get(computedPropertyId) ?? new Set();
    existingVersions.add(version);
    this.versionsById.set(computedPropertyId, existingVersions);
  }

  setPeriods(periods: Period[]) {
    for (const period of periods) {
      this.set({
        computedPropertyId: period.computedPropertyId,
        version: period.version,
        period,
      });
    }
  }

  getForComputedPropertyId(computedPropertyId: string): Period[] {
    return Array.from(this.versionsById.get(computedPropertyId) ?? []).flatMap(
      (version) => this.get({ computedPropertyId, version }) ?? [],
    );
  }

  getAll(): Period[] {
    return Array.from(this.map.values());
  }
}

export async function getPeriodsByComputedPropertyId({
  workspaceId,
  step,
  computedPropertyId,
  computedPropertyType,
}: {
  workspaceId: string;
  step: ComputedPropertyStep;
  computedPropertyType?: "Segment" | "UserProperty";
  computedPropertyId?: string;
}): Promise<PeriodByComputedPropertyId> {
  const queryConditions: SQL[] = [
    sql`${dbComputedPropertyPeriod.workspaceId} = CAST(${workspaceId} AS UUID)`,
    sql`${dbComputedPropertyPeriod.step} = ${step}`,
  ];

  if (computedPropertyId) {
    queryConditions.push(
      sql`${dbComputedPropertyPeriod.computedPropertyId} = CAST(${computedPropertyId} AS UUID)`,
    );
  }

  if (computedPropertyType) {
    queryConditions.push(
      sql`${dbComputedPropertyPeriod.type} = ${computedPropertyType}`,
    );
  }

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
    WHERE ${and(...queryConditions)}
    ORDER BY 
      ${dbComputedPropertyPeriod.workspaceId}, 
      ${dbComputedPropertyPeriod.type}, 
      ${dbComputedPropertyPeriod.computedPropertyId}, 
      ${dbComputedPropertyPeriod.to} DESC`)
  ).rows;

  const transformedPeriods = periods.map((p) => ({
    maxTo: new Date(`${p.maxTo}+0000`),
    computedPropertyId: p.computedPropertyId,
    version: p.version,
    type: p.type,
  }));
  const pbcpp = new PeriodByComputedPropertyId();
  pbcpp.setPeriods(transformedPeriods);
  return pbcpp;
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
  if (newPeriods.length === 0) {
    logger().debug(
      {
        workspaceId,
        step,
      },
      "No new periods to create",
    );
    return;
  }

  await db().transaction(async (tx) => {
    logger().debug({ newPeriods }, "Creating periods");
    await tx
      .insert(dbComputedPropertyPeriod)
      .values(newPeriods)
      .onConflictDoNothing();
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

const EARLIEST_COMPUTE_PROPERTY_STEP =
  ComputedPropertyStepEnum.ComputeAssignments;

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
        eq(dbSegment.status, "Running"),
      ),
    )
    .leftJoin(
      dbUserProperty,
      and(
        eq(dbComputedPropertyPeriod.computedPropertyId, dbUserProperty.id),
        eq(dbComputedPropertyPeriod.type, "UserProperty"),
        eq(dbUserProperty.status, "Running"),
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
  const whereConditions: (SQL | undefined)[] = [
    eq(w.status, WorkspaceStatusDbEnum.Active),
    not(eq(w.type, WorkspaceTypeAppEnum.Parent)),
    or(
      inArray(w.id, db().select({ id: dbSegment.workspaceId }).from(dbSegment)),
      inArray(
        w.id,
        db().select({ id: dbUserProperty.workspaceId }).from(dbUserProperty),
      ),
    ),
  ];
  if (config().useGlobalComputedProperties === false) {
    logger().debug("Not using global computed properties");
    whereConditions.push(
      eq(schema.feature.name, FeatureNamesEnum.ComputePropertiesGlobal),
    );
    whereConditions.push(eq(schema.feature.enabled, true));
  } else {
    logger().debug("Using global computed properties");
  }

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
    .leftJoin(schema.feature, eq(schema.feature.workspaceId, w.id))
    // Only left join on computedPropertyPeriod for step=ComputeAssignments
    .leftJoin(
      cpp,
      and(
        eq(cpp.workspaceId, w.id),
        eq(cpp.step, ComputedPropertyStepEnum.ComputeAssignments),
      ),
    )
    .where(and(...whereConditions))
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

export async function findDueWorkspaceMinTos({
  now,
  interval = config().computePropertiesInterval,
  limit = 100,
}: FindDueWorkspacesParams): Promise<
  { min: Date | null; workspaceId: string }[]
> {
  const w = aliasedTable(schema.workspace, "w");
  const cpp = aliasedTable(schema.computedPropertyPeriod, "cpp");
  const aggregatedMin = min(cpp.to);
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
  const whereConditions: (SQL | undefined)[] = [
    eq(w.status, WorkspaceStatusDbEnum.Active),
    not(eq(w.type, WorkspaceTypeAppEnum.Parent)),
    or(
      inArray(
        w.id,
        db()
          .select({ id: dbSegment.workspaceId })
          .from(dbSegment)
          .where(eq(dbSegment.status, "Running")),
      ),
      inArray(
        w.id,
        db()
          .select({ id: dbUserProperty.workspaceId })
          .from(dbUserProperty)
          .where(eq(dbUserProperty.status, "Running")),
      ),
    ),
  ];

  /**
   * Explanation:
   * - We select from `workspace w` (with an INNER JOIN on `feature` to ensure
   *   only those with `ComputePropertiesGlobal` enabled).
   * - We LEFT JOIN `computedPropertyPeriod` to pull the last period if it exists,
   *   but still keep the workspace even if no records exist (`NULL` aggregatedMax).
   * - We filter on w.status, w.type, feature.name, and feature.enabled, as before.
   * - In the HAVING clause, we check:
   *    (a) aggregatedMin IS NULL  => no computations ever run (cold start)
   *    (b) aggregatedMin is older than `interval`.
   * - Then we order by aggregatedMin ASC (nulls first) so that brand-new
   *   (never computed) workspaces appear first, then oldest computations after.
   */
  const periodsQuery = await db()
    .select({
      workspaceId: w.id,
      min: aggregatedMin,
    })
    .from(w)
    .leftJoin(
      cpp,
      and(
        eq(cpp.workspaceId, w.id),
        eq(cpp.step, ComputedPropertyStepEnum.ComputeAssignments),
        or(
          and(
            eq(cpp.type, "Segment"),
            eq(
              cpp.computedPropertyId,
              inArray(
                cpp.computedPropertyId,
                db()
                  .select({ id: dbSegment.id })
                  .from(dbSegment)
                  .where(eq(dbSegment.status, "Running")),
              ),
            ),
            and(
              eq(cpp.type, "UserProperty"),
              eq(
                cpp.computedPropertyId,
                inArray(
                  cpp.computedPropertyId,
                  db()
                    .select({ id: dbUserProperty.id })
                    .from(dbUserProperty)
                    .where(eq(dbUserProperty.status, "Running")),
                ),
              ),
            ),
          ),
        ),
      ),
    )
    .where(and(...whereConditions))
    .groupBy(w.id)
    .having(
      or(
        // Cold start: aggregatedMax is null => no existing compute records
        sql`${aggregatedMin} IS NULL`,
        // Overdue: last computation older than our interval
        sql`(to_timestamp(${timestampNow}) - ${aggregatedMin}) > ${secondsInterval}::interval`,
      ),
    )
    .orderBy(sql`${aggregatedMin} ASC NULLS FIRST`)
    .limit(limit);

  return periodsQuery;
}

export async function findDueWorkspaceMinTosModel({
  now,
  interval = config().computePropertiesInterval,
  limit = 100,
}: FindDueWorkspacesParams): Promise<
  { min: Date | null; workspaceId: string }[]
> {
  const secondsInterval = Math.floor(interval / 1000);
  const nowTime = new Date(now);

  const query = sql`
    WITH due_properties AS (
        -- Due Segments
        SELECT
            s.workspace_id,
            MAX(cpp.to) as last_computed
        FROM segments s
        LEFT JOIN computed_property_periods cpp ON cpp.computed_property_id = s.id AND cpp.type = 'Segment'
        WHERE s.status = 'Running'
        GROUP BY s.id
        HAVING (
            MAX(cpp.to) IS NULL OR
            ${nowTime} - MAX(cpp.to) > MAKE_INTERVAL(secs => ${secondsInterval})
        )

        UNION ALL

        -- Due User Properties
        SELECT
            up.workspace_id,
            MAX(cpp.to) as last_computed
        FROM user_properties up
        LEFT JOIN computed_property_periods cpp ON cpp.computed_property_id = up.id AND cpp.type = 'UserProperty'
        WHERE up.status = 'Running'
        GROUP BY up.id
        HAVING (
            MAX(cpp.to) IS NULL OR
            ${nowTime} - MAX(cpp.to) > MAKE_INTERVAL(secs => ${secondsInterval})
        )
    )
    -- Aggregate to get the oldest due property per workspace
    SELECT
        dp.workspace_id as "workspaceId",
        MIN(dp.last_computed) as "min"
    FROM due_properties dp
    JOIN workspaces w ON w.id = dp.workspace_id
    WHERE w.status = 'Active' AND w.type != 'Parent'
    GROUP BY dp.workspace_id
    ORDER BY "min" ASC NULLS FIRST
    LIMIT ${limit};
  `;

  const results = await db().execute<{ workspaceId: string; min: Date | null }>(
    query,
  );
  return results.rows;
}

export async function getComputedPropertyPeriods({
  workspaceId,
  step,
}: GetComputedPropertyPeriodsRequest): Promise<GetComputedPropertyPeriodsResponse> {
  const periodByComputedPropertyId = await getPeriodsByComputedPropertyId({
    workspaceId,
    step,
  });
  const all = periodByComputedPropertyId.getAll();
  return {
    periods: all.map((p) => ({
      id: p.computedPropertyId,
      workspaceId,
      type: p.type,
      lastRecomputed: p.maxTo.toISOString(),
    })),
  };
}

export async function triggerWorkspaceRecompute({
  workspaceId,
}: {
  workspaceId: string;
}) {
  logger().info({ workspaceId }, "Triggering workspace recompute");
  const feature = await getFeature({
    name: FeatureNamesEnum.ComputePropertiesGlobal,
    workspaceId,
  });
  if (feature) {
    await signalAddWorkspacesV2({
      // choosing a priority of 10 to be higher than the default of 0 but with
      // some room to add lower priority items
      items: [{ id: workspaceId, priority: 10 }],
    });
  } else {
    await signalComputePropertiesEarly({ workspaceId });
  }
}
