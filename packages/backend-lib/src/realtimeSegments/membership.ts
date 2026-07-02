import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../db";
import { realtimeSegmentMembership as dbRealtimeSegmentMembership } from "../db/schema";
import { RealtimeSegmentAssignmentChange } from "./assignments";

export interface RealtimeSegmentMembership {
  segmentId: string;
  inSegment: boolean;
  eventTime: Date;
}

export async function findRealtimeSegmentMemberships({
  workspaceId,
  userId,
  segmentIds,
}: {
  workspaceId: string;
  userId: string;
  segmentIds: string[];
}): Promise<RealtimeSegmentMembership[]> {
  if (segmentIds.length === 0) {
    return [];
  }

  const rows = await db()
    .select({
      segmentId: dbRealtimeSegmentMembership.segmentId,
      inSegment: dbRealtimeSegmentMembership.inSegment,
      eventTime: dbRealtimeSegmentMembership.eventTime,
    })
    .from(dbRealtimeSegmentMembership)
    .where(
      and(
        sql`${dbRealtimeSegmentMembership.workspaceId} = CAST(${workspaceId} AS UUID)`,
        eq(dbRealtimeSegmentMembership.userId, userId),
        inArray(dbRealtimeSegmentMembership.segmentId, segmentIds),
      ),
    );

  return rows;
}

export async function upsertRealtimeSegmentMemberships(
  assignments: RealtimeSegmentAssignmentChange[],
): Promise<void> {
  if (assignments.length === 0) {
    return;
  }

  const now = new Date();
  await db()
    .insert(dbRealtimeSegmentMembership)
    .values(
      assignments.map((assignment) => ({
        workspaceId: assignment.workspaceId,
        segmentId: assignment.segmentId,
        userId: assignment.userId,
        inSegment: assignment.inSegment,
        eventTime: assignment.maxEventTime,
        assignedAt: assignment.assignedAt,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [
        dbRealtimeSegmentMembership.workspaceId,
        dbRealtimeSegmentMembership.segmentId,
        dbRealtimeSegmentMembership.userId,
      ],
      set: {
        inSegment: sql`CASE WHEN excluded."eventTime" >= ${dbRealtimeSegmentMembership.eventTime} THEN excluded."inSegment" ELSE ${dbRealtimeSegmentMembership.inSegment} END`,
        eventTime: sql`GREATEST(${dbRealtimeSegmentMembership.eventTime}, excluded."eventTime")`,
        assignedAt: sql`CASE WHEN excluded."eventTime" >= ${dbRealtimeSegmentMembership.eventTime} THEN excluded."assignedAt" ELSE ${dbRealtimeSegmentMembership.assignedAt} END`,
        updatedAt: now,
      },
    });
}
