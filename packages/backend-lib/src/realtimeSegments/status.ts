import { and, inArray, sql } from "drizzle-orm";

import { db } from "../db";
import {
  realtimeSegmentStatus as dbRealtimeSegmentStatus,
  segment as dbSegment,
} from "../db/schema";
import { RealtimeSegmentStatusResource } from "../types";

export interface RealtimeSegmentStatusIncrement {
  workspaceId: string;
  segmentId: string;
  mode: string;
  evaluatedAt: Date;
  assignedAt?: Date;
  triggeredAt?: Date;
  evaluatedCount: number;
  assignmentCount: number;
  triggeredJourneyCount: number;
  unsupportedCount: number;
}

export type RealtimeSegmentStatusBySegmentId = Map<
  string,
  RealtimeSegmentStatusResource
>;

function toResource(
  status: typeof dbRealtimeSegmentStatus.$inferSelect,
): RealtimeSegmentStatusResource {
  return {
    mode: status.mode,
    lastEvaluatedAt: status.lastEvaluatedAt?.getTime(),
    lastAssignmentAt: status.lastAssignmentAt?.getTime(),
    lastTriggeredAt: status.lastTriggeredAt?.getTime(),
    evaluatedCount: status.evaluatedCount,
    assignmentCount: status.assignmentCount,
    triggeredJourneyCount: status.triggeredJourneyCount,
    unsupportedCount: status.unsupportedCount,
  };
}

export async function findRealtimeSegmentStatusBySegmentId({
  workspaceId,
  segmentIds,
}: {
  workspaceId: string;
  segmentIds: string[];
}): Promise<RealtimeSegmentStatusBySegmentId> {
  if (segmentIds.length === 0) {
    return new Map();
  }

  const rows = await db()
    .select()
    .from(dbRealtimeSegmentStatus)
    .where(
      and(
        sql`${dbRealtimeSegmentStatus.workspaceId} = CAST(${workspaceId} AS UUID)`,
        inArray(dbRealtimeSegmentStatus.segmentId, segmentIds),
      ),
    );

  return new Map(rows.map((row) => [row.segmentId, toResource(row)]));
}

export async function findRealtimeSegmentStatusByWorkspace({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<RealtimeSegmentStatusBySegmentId> {
  const rows = await db()
    .select({
      status: dbRealtimeSegmentStatus,
    })
    .from(dbRealtimeSegmentStatus)
    .innerJoin(
      dbSegment,
      and(
        sql`${dbRealtimeSegmentStatus.segmentId} = ${dbSegment.id}`,
        sql`${dbSegment.workspaceId} = CAST(${workspaceId} AS UUID)`,
      ),
    )
    .where(
      sql`${dbRealtimeSegmentStatus.workspaceId} = CAST(${workspaceId} AS UUID)`,
    );

  return new Map(
    rows.map((row) => [row.status.segmentId, toResource(row.status)]),
  );
}

export async function recordRealtimeSegmentStatus(
  increments: RealtimeSegmentStatusIncrement[],
): Promise<void> {
  if (increments.length === 0) {
    return;
  }

  const now = new Date();
  await db()
    .insert(dbRealtimeSegmentStatus)
    .values(
      increments.map((increment) => ({
        workspaceId: increment.workspaceId,
        segmentId: increment.segmentId,
        mode: increment.mode,
        lastEvaluatedAt: increment.evaluatedAt,
        lastAssignmentAt: increment.assignedAt,
        lastTriggeredAt: increment.triggeredAt,
        evaluatedCount: increment.evaluatedCount,
        assignmentCount: increment.assignmentCount,
        triggeredJourneyCount: increment.triggeredJourneyCount,
        unsupportedCount: increment.unsupportedCount,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [
        dbRealtimeSegmentStatus.workspaceId,
        dbRealtimeSegmentStatus.segmentId,
      ],
      set: {
        mode: sql`excluded."mode"`,
        lastEvaluatedAt: sql`GREATEST(COALESCE(${dbRealtimeSegmentStatus.lastEvaluatedAt}, excluded."lastEvaluatedAt"), excluded."lastEvaluatedAt")`,
        lastAssignmentAt: sql`CASE WHEN excluded."lastAssignmentAt" IS NULL THEN ${dbRealtimeSegmentStatus.lastAssignmentAt} ELSE GREATEST(COALESCE(${dbRealtimeSegmentStatus.lastAssignmentAt}, excluded."lastAssignmentAt"), excluded."lastAssignmentAt") END`,
        lastTriggeredAt: sql`CASE WHEN excluded."lastTriggeredAt" IS NULL THEN ${dbRealtimeSegmentStatus.lastTriggeredAt} ELSE GREATEST(COALESCE(${dbRealtimeSegmentStatus.lastTriggeredAt}, excluded."lastTriggeredAt"), excluded."lastTriggeredAt") END`,
        evaluatedCount: sql`${dbRealtimeSegmentStatus.evaluatedCount} + excluded."evaluatedCount"`,
        assignmentCount: sql`${dbRealtimeSegmentStatus.assignmentCount} + excluded."assignmentCount"`,
        triggeredJourneyCount: sql`${dbRealtimeSegmentStatus.triggeredJourneyCount} + excluded."triggeredJourneyCount"`,
        unsupportedCount: sql`${dbRealtimeSegmentStatus.unsupportedCount} + excluded."unsupportedCount"`,
        updatedAt: now,
      },
    });
}
