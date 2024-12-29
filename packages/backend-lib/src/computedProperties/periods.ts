import { ComputedPropertyPeriod, Prisma } from "@prisma/client";
import { and, eq, max } from "drizzle-orm";

import { db } from "../db";
import {
  computedPropertyPeriod as dbComputedPropertyPeriod,
  segment as dbSegment,
  userProperty as dbUserProperty,
} from "../db/schema";
import logger from "../logger";
import prisma from "../prisma";
import {
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
  private map: PeriodByComputedPropertyIdMap;

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
  const periodsQuery = Prisma.sql`
    SELECT DISTINCT ON ("workspaceId", "type", "computedPropertyId")
      "type",
      "computedPropertyId",
      "version",
      MAX("to") OVER (PARTITION BY "workspaceId", "type", "computedPropertyId") as "maxTo"
    FROM "ComputedPropertyPeriod"
    WHERE
      "workspaceId" = CAST(${workspaceId} AS UUID)
      AND "step" = ${step}
    ORDER BY "workspaceId", "type", "computedPropertyId", "to" DESC;
  `;
  const periods =
    await prisma().$queryRaw<AggregatedComputedPropertyPeriod[]>(periodsQuery);

  const periodByComputedPropertyId =
    periods.reduce<PeriodByComputedPropertyIdMap>((acc, period) => {
      const { maxTo } = period;
      const key = PeriodByComputedPropertyId.getKey(period);
      acc.set(key, {
        maxTo,
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
        maxTo: new Date(maxTo),
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
  const newPeriods: Prisma.ComputedPropertyPeriodCreateManyInput[] = [];

  for (const segment of segments) {
    const version = segment.definitionUpdatedAt.toString();
    const previousPeriod = periodByComputedPropertyId?.get({
      version,
      computedPropertyId: segment.id,
    });
    newPeriods.push({
      workspaceId,
      step,
      type: "Segment",
      computedPropertyId: segment.id,
      from: previousPeriod ? new Date(previousPeriod.maxTo) : null,
      to: new Date(now),
      version,
    });
  }

  for (const userProperty of userProperties) {
    const version = userProperty.definitionUpdatedAt.toString();
    const previousPeriod = periodByComputedPropertyId?.get({
      version,
      computedPropertyId: userProperty.id,
    });
    newPeriods.push({
      workspaceId,
      step,
      type: "UserProperty",
      computedPropertyId: userProperty.id,
      from: previousPeriod ? new Date(previousPeriod.maxTo) : null,
      to: new Date(now),
      version,
    });
  }

  await prisma().$transaction(async (tx) => {
    await tx.computedPropertyPeriod.createMany({
      data: newPeriods,
      skipDuplicates: true,
    });
    await tx.computedPropertyPeriod.deleteMany({
      where: {
        workspaceId,
        step,
        to: {
          // 5 minutes retention
          lt: new Date(now - 60 * 1000 * 5),
        },
      },
    });
  });
}

export async function getEarliestComputePropertyPeriod({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<number> {
  const step = ComputedPropertyStep.ProcessAssignments;
  const query = Prisma.sql`
    SELECT
      MIN("maxTo") as "minTo"
    FROM (
      SELECT
        cpp."type",
        cpp."computedPropertyId",
        MAX(cpp."to") as "maxTo"
      FROM "ComputedPropertyPeriod" cpp
      LEFT JOIN "Segment" s ON s."id" = cpp."computedPropertyId" AND cpp."type" = 'Segment'
      LEFT JOIN "UserProperty" up ON up."id" = cpp."computedPropertyId" AND cpp."type" = 'UserProperty'
      WHERE
        cpp."workspaceId" = CAST(${workspaceId} AS UUID)
        AND cpp."step" = ${step}
        AND cpp."version" = round(extract(epoch from COALESCE(s."definitionUpdatedAt", up."definitionUpdatedAt")) * 1000) :: text
      GROUP BY
        cpp."type",
        cpp."computedPropertyId"
    ) as "maxPerComputedProperty"
  `;

  const result = await prisma().$queryRaw<{ minTo: Date | null }[]>(query);
  logger().debug({ result }, "Earliest computed property period");

  const minTo = result[0]?.minTo?.getTime();
  if (!minTo) {
    logger().error(
      {
        result,
        workspaceId,
        step,
      },
      "No computed property periods found",
    );
    return 0;
  }
  return minTo;
}
