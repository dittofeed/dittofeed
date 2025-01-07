import { randomUUID } from "crypto";
import { and, eq, lt, max, min, sql } from "drizzle-orm";

import { db } from "../db";
import {
  computedPropertyPeriod as dbComputedPropertyPeriod,
  segment as dbSegment,
  userProperty as dbUserProperty,
} from "../db/schema";
import logger from "../logger";
import {
  ComputedPropertyPeriod,
  ComputedPropertyStep,
  SavedSegmentResource,
  SavedUserPropertyResource,
} from "../types";

export type AggregatedComputedPropertyPeriod = Omit<
  ComputedPropertyPeriod,
  "from" | "workspaceId" | "to"
> & {
  maxTo: ComputedPropertyPeriod["to"];
};

export type PeriodByComputedPropertyIdMap = Map<
  string,
  Pick<
    AggregatedComputedPropertyPeriod,
    "maxTo" | "computedPropertyId" | "version"
  >
>;

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
  }) {
    return this.map.get(
      PeriodByComputedPropertyId.getKey({
        computedPropertyId,
        version,
      }),
    );
  }
}

export async function getPeriodsByComputedPropertyId({
  workspaceId,
  step,
}: {
  workspaceId: string;
  step: ComputedPropertyStep;
}): Promise<PeriodByComputedPropertyId> {
  const maxPeriods = db()
    .select({
      workspaceId: dbComputedPropertyPeriod.workspaceId,
      type: dbComputedPropertyPeriod.type,
      computedPropertyId: dbComputedPropertyPeriod.computedPropertyId,
      maxTo: max(dbComputedPropertyPeriod.to).as("maxTo"),
    })
    .from(dbComputedPropertyPeriod)
    .groupBy(
      dbComputedPropertyPeriod.workspaceId,
      dbComputedPropertyPeriod.type,
      dbComputedPropertyPeriod.computedPropertyId,
    )
    .as("maxPeriods");

  const periods = await db()
    .select({
      type: dbComputedPropertyPeriod.type,
      computedPropertyId: dbComputedPropertyPeriod.computedPropertyId,
      version: dbComputedPropertyPeriod.version,
      maxTo: maxPeriods.maxTo,
    })
    .from(dbComputedPropertyPeriod)
    .innerJoin(
      maxPeriods,
      and(
        eq(dbComputedPropertyPeriod.workspaceId, maxPeriods.workspaceId),
        eq(dbComputedPropertyPeriod.type, maxPeriods.type),
        eq(
          dbComputedPropertyPeriod.computedPropertyId,
          maxPeriods.computedPropertyId,
        ),
        eq(dbComputedPropertyPeriod.to, maxPeriods.maxTo),
      ),
    )
    .where(
      and(
        eq(dbComputedPropertyPeriod.workspaceId, workspaceId),
        eq(dbComputedPropertyPeriod.step, step),
      ),
    );

  const periodByComputedPropertyId =
    periods.reduce<PeriodByComputedPropertyIdMap>((acc, period) => {
      const { maxTo } = period;
      const key = PeriodByComputedPropertyId.getKey(period);
      if (!maxTo) {
        return acc;
      }
      acc.set(key, {
        maxTo: new Date(maxTo),
        computedPropertyId: period.computedPropertyId,
        version: period.version,
      });
      return acc;
    }, new Map());

  return new PeriodByComputedPropertyId(periodByComputedPropertyId);
}

export async function getPeriodsByComputedPropertyIdV2({
  workspaceId,
  step,
}: {
  workspaceId: string;
  step: ComputedPropertyStep;
}): Promise<PeriodByComputedPropertyId> {
  const result = await db()
    .selectDistinctOn(
      [
        dbComputedPropertyPeriod.workspaceId,
        dbComputedPropertyPeriod.type,
        dbComputedPropertyPeriod.computedPropertyId,
      ],
      {
        type: dbComputedPropertyPeriod.type,
        computedPropertyId: dbComputedPropertyPeriod.computedPropertyId,
        version: dbComputedPropertyPeriod.version,
        maxTo: max(dbComputedPropertyPeriod.to),
      },
    )
    .from(dbComputedPropertyPeriod)
    .where(
      and(
        eq(dbComputedPropertyPeriod.workspaceId, workspaceId),
        eq(dbComputedPropertyPeriod.step, step),
      ),
    )
    .leftJoin(
      dbSegment,
      eq(dbComputedPropertyPeriod.computedPropertyId, dbSegment.id),
    )
    .leftJoin(
      dbUserProperty,
      eq(dbComputedPropertyPeriod.computedPropertyId, dbUserProperty.id),
    )
    .groupBy(
      dbComputedPropertyPeriod.workspaceId,
      dbComputedPropertyPeriod.type,
      dbComputedPropertyPeriod.computedPropertyId,
    );

  const periodByComputedPropertyId =
    result.reduce<PeriodByComputedPropertyIdMap>((acc, period) => {
      const { maxTo } = period;
      const key = PeriodByComputedPropertyId.getKey(period);
      if (!maxTo) {
        return acc;
      }
      acc.set(key, {
        maxTo,
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
  logger().debug(
    {
      periodByComputedPropertyId: Object.fromEntries(
        periodByComputedPropertyId?.map ?? new Map(),
      ),
    },
    "loc4 periodByComputedPropertyId",
  );

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

  logger().debug({ newPeriods }, "Creating computed property periods");
  await db().transaction(async (tx) => {
    await tx
      .insert(dbComputedPropertyPeriod)
      .values(newPeriods)
      .onConflictDoNothing();
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

  // FIXME can't parse minTo as a unix timestamp string
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
