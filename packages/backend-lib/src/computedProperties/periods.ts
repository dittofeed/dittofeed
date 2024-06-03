import { ComputedPropertyPeriod, Prisma } from "@prisma/client";

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

  logger().debug({ newPeriods }, "Creating computed property periods");
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
  const [userProperties, segments] = await Promise.all([
    prisma().userProperty.findMany({
      where: {
        workspaceId,
      },
      select: {
        id: true,
        definitionUpdatedAt: true,
      },
    }),
    prisma().segment.findMany({
      where: {
        workspaceId,
      },
      select: {
        id: true,
        definitionUpdatedAt: true,
      },
    }),
  ]);
  const step = ComputedPropertyStep.ProcessAssignments;
  const pairs: [string, string][] = [
    ...userProperties.map<[string, string]>((up) => [
      up.id,
      up.definitionUpdatedAt.getTime().toString(),
    ]),
    ...segments.map<[string, string]>((s) => [
      s.id,
      s.definitionUpdatedAt.getTime().toString(),
    ]),
  ];

  const conditions = Prisma.join(
    pairs.map(
      ([computedPropertyId, version]) =>
        Prisma.sql`("computedPropertyId" = CAST(${computedPropertyId} AS UUID) AND "version" = ${version})`,
    ),
    " OR ",
  );

  const query = Prisma.sql`
    SELECT
      MIN("to") as "minTo"
    FROM "ComputedPropertyPeriod"
    WHERE
      "workspaceId" = CAST(${workspaceId} AS UUID)
      AND "step" = ${step}
      AND (${conditions})
  `;

  const result = await prisma().$queryRaw<{ minTo: Date }[]>(query);
  const minTo = result[0]?.minTo.getTime();
  if (!minTo) {
    logger().error(
      {
        result,
      },
      "No computed property periods found",
    );
    return 0;
  }
  return minTo;
}
