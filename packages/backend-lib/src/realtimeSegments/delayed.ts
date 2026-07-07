import { randomUUID } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../db";
import { realtimeSegmentDelayedEval as dbRealtimeSegmentDelayedEval } from "../db/schema";
import logger from "../logger";
import {
  RelationalOperators,
  SavedSegmentResource,
  SegmentNode,
  SegmentNodeType,
  TimeOperator,
} from "../types";
import { getRealtimeSegmentQueue } from "./queue";
import { RealtimeUserState } from "./state";
import { RealtimeSegmentEvalJob } from "./types";

export const DELAYED_REEVALUATION_EVENT_TYPE = "delayed_realtime_segment_eval";

interface DelayedReevaluation {
  workspaceId: string;
  segmentId: string;
  userId?: string;
  anonymousId?: string;
  userOrAnonymousId: string;
  event: string;
  eventTime: Date;
  availableAt: Date;
}

interface ClaimedDelayedReevaluation
  extends DelayedReevaluation,
    Record<string, unknown> {
  id: string;
  attempts: number;
}

interface DelayedBoundary {
  segmentId: string;
  event: string;
  eventTime: Date;
  availableAt: Date;
}

function toDate(value: Date | string, fieldName: string): Date {
  if (value instanceof Date) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid delayed reevaluation ${fieldName}`);
  }
  return parsed;
}

function segmentNodes(segment: SavedSegmentResource): SegmentNode[] {
  return [segment.definition.entryNode, ...segment.definition.nodes];
}

function performedWindowSeconds(node: SegmentNode): number | null {
  if (node.type !== SegmentNodeType.Performed) {
    return null;
  }
  if (node.timeOperator && node.timeOperator !== TimeOperator.Within) {
    return null;
  }
  return node.withinSeconds ?? null;
}

function shouldSchedulePerformedNode(node: SegmentNode): boolean {
  if (node.type !== SegmentNodeType.Performed) {
    return false;
  }
  return (
    node.timesOperator === RelationalOperators.Equals ||
    node.timesOperator === RelationalOperators.LessThan ||
    node.timesOperator === RelationalOperators.GreaterThanOrEqual ||
    node.timesOperator === undefined
  );
}

export function computeDelayedReevaluationBoundaries({
  segments,
  state,
  now = new Date(),
}: {
  segments: SavedSegmentResource[];
  state: RealtimeUserState;
  now?: Date;
}): DelayedBoundary[] {
  const boundaries = new Map<string, DelayedBoundary>();
  const nowMs = now.getTime();

  for (const segment of segments) {
    for (const node of segmentNodes(segment)) {
      if (node.type !== SegmentNodeType.Performed) {
        continue;
      }
      const withinSeconds = performedWindowSeconds(node);
      if (!withinSeconds || !shouldSchedulePerformedNode(node)) {
        continue;
      }
      for (const event of state.trackEvents) {
        if (event.event !== node.event) {
          continue;
        }
        const availableAt = new Date(
          event.eventTime.getTime() + withinSeconds * 1000,
        );
        if (availableAt.getTime() <= nowMs) {
          continue;
        }
        const key = `${segment.id}:${state.userOrAnonymousId}:${availableAt.getTime()}`;
        boundaries.set(key, {
          segmentId: segment.id,
          event: node.event,
          eventTime: availableAt,
          availableAt,
        });
      }
    }
  }

  return [...boundaries.values()];
}

export async function scheduleDelayedReevaluations({
  workspaceId,
  userId,
  anonymousId,
  state,
  segments,
  now = new Date(),
}: {
  workspaceId: string;
  userId?: string;
  anonymousId?: string;
  state: RealtimeUserState;
  segments: SavedSegmentResource[];
  now?: Date;
}): Promise<number> {
  const boundaries = computeDelayedReevaluationBoundaries({
    segments,
    state,
    now,
  });
  if (boundaries.length === 0) {
    return 0;
  }

  await db()
    .insert(dbRealtimeSegmentDelayedEval)
    .values(
      boundaries.map((boundary) => ({
        workspaceId,
        segmentId: boundary.segmentId,
        userId,
        anonymousId,
        userOrAnonymousId: state.userOrAnonymousId,
        event: boundary.event,
        eventTime: boundary.eventTime,
        availableAt: boundary.availableAt,
      })),
    )
    .onConflictDoNothing({
      target: [
        dbRealtimeSegmentDelayedEval.workspaceId,
        dbRealtimeSegmentDelayedEval.segmentId,
        dbRealtimeSegmentDelayedEval.userOrAnonymousId,
        dbRealtimeSegmentDelayedEval.availableAt,
      ],
    });

  return boundaries.length;
}

function delayedMessageId(row: DelayedReevaluation, availableAt: Date): string {
  return [
    "delayed",
    row.workspaceId,
    row.segmentId,
    row.userOrAnonymousId,
    availableAt.getTime(),
  ].join(":");
}

function toRealtimeJob(
  row: ClaimedDelayedReevaluation,
): RealtimeSegmentEvalJob {
  const availableAt = toDate(row.availableAt, "availableAt");
  const eventTime = toDate(row.eventTime, "eventTime");

  return {
    workspaceId: row.workspaceId,
    messageId: delayedMessageId(row, availableAt),
    userId: row.userId,
    anonymousId: row.anonymousId,
    userOrAnonymousId: row.userOrAnonymousId,
    eventType: DELAYED_REEVALUATION_EVENT_TYPE,
    event: row.event,
    traitPaths: [],
    propertyPaths: [],
    payload: {
      delayedReevaluationId: row.id,
      segmentId: row.segmentId,
    },
    eventTime,
    processingTime: new Date(),
  };
}

export function isIdentifiedDelayedReevaluation(
  row: Pick<DelayedReevaluation, "userId">,
): boolean {
  return Boolean(row.userId);
}

async function claimDueDelayedReevaluations({
  lockId,
  batchSize,
  maxRetries,
}: {
  lockId: string;
  batchSize: number;
  maxRetries: number;
}): Promise<ClaimedDelayedReevaluation[]> {
  const result = await db().execute<ClaimedDelayedReevaluation>(sql`
    WITH claimed AS (
      SELECT ${dbRealtimeSegmentDelayedEval.id}
      FROM ${dbRealtimeSegmentDelayedEval}
      WHERE
        ${dbRealtimeSegmentDelayedEval.status} IN ('Pending', 'Retry')
        AND ${dbRealtimeSegmentDelayedEval.availableAt} <= now()
        AND ${dbRealtimeSegmentDelayedEval.attempts} < ${maxRetries}
      ORDER BY ${dbRealtimeSegmentDelayedEval.availableAt} ASC, ${dbRealtimeSegmentDelayedEval.createdAt} ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    UPDATE ${dbRealtimeSegmentDelayedEval} job
    SET
      "status" = 'Processing',
      "attempts" = job."attempts" + 1,
      "lockedAt" = now(),
      "lockId" = ${lockId},
      "updatedAt" = now()
    FROM claimed
    WHERE job."id" = claimed."id"
    RETURNING
      job."id"::text AS "id",
      job."workspaceId"::text AS "workspaceId",
      job."segmentId"::text AS "segmentId",
      job."userId" AS "userId",
      job."anonymousId" AS "anonymousId",
      job."userOrAnonymousId" AS "userOrAnonymousId",
      job."event" AS "event",
      job."eventTime" AS "eventTime",
      job."availableAt" AS "availableAt",
      job."attempts" AS "attempts"
  `);

  return result.rows;
}

async function markDelayedReevaluationsComplete({
  ids,
  lockId,
}: {
  ids: string[];
  lockId: string;
}): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await db()
    .update(dbRealtimeSegmentDelayedEval)
    .set({
      status: "Completed",
      lockedAt: null,
      lockId: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(dbRealtimeSegmentDelayedEval.id, ids),
        eq(dbRealtimeSegmentDelayedEval.lockId, lockId),
      ),
    );
}

async function markDelayedReevaluationsFailed({
  ids,
  lockId,
  error,
  maxRetries,
}: {
  ids: string[];
  lockId: string;
  error: Error;
  maxRetries: number;
}): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await db()
    .update(dbRealtimeSegmentDelayedEval)
    .set({
      status: sql`CASE WHEN "attempts" >= ${maxRetries} THEN 'Failed' ELSE 'Retry' END`,
      availableAt: sql`CASE WHEN "attempts" >= ${maxRetries} THEN "availableAt" ELSE now() + make_interval(secs => LEAST(300, POWER(2, "attempts")::int)) END`,
      lockedAt: null,
      lockId: null,
      lastError: error.message,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(dbRealtimeSegmentDelayedEval.id, ids),
        eq(dbRealtimeSegmentDelayedEval.lockId, lockId),
      ),
    );
}

export async function enqueueDueDelayedReevaluations({
  batchSize,
  maxRetries,
}: {
  batchSize: number;
  maxRetries: number;
}): Promise<number> {
  const lockId = randomUUID();
  const claimed = await claimDueDelayedReevaluations({
    lockId,
    batchSize,
    maxRetries,
  });
  if (claimed.length === 0) {
    return 0;
  }

  const identified = claimed.filter(isIdentifiedDelayedReevaluation);
  const skipped = claimed.filter(
    (row) => !isIdentifiedDelayedReevaluation(row),
  );
  const ids = identified.map((row) => row.id);
  if (skipped.length > 0) {
    await markDelayedReevaluationsComplete({
      ids: skipped.map((row) => row.id),
      lockId,
    });
    logger().info(
      { skippedCount: skipped.length },
      "Skipped delayed realtime segment reevaluations without userId.",
    );
  }
  if (identified.length === 0) {
    return 0;
  }

  try {
    await getRealtimeSegmentQueue().enqueue(identified.map(toRealtimeJob));
    await markDelayedReevaluationsComplete({ ids, lockId });
    return identified.length;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger().error(
      { err: error, delayedReevaluationCount: identified.length },
      "Failed to enqueue delayed realtime segment reevaluations.",
    );
    await markDelayedReevaluationsFailed({
      ids,
      lockId,
      error,
      maxRetries,
    });
    throw error;
  }
}
