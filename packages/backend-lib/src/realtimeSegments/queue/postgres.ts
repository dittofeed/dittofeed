import { sql } from "drizzle-orm";

/* eslint-disable class-methods-use-this */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { db } from "../../db";
import { realtimeSegmentEvalJob as dbRealtimeSegmentEvalJob } from "../../db/schema";
import {
  ClaimedRealtimeSegmentEvalJob,
  RealtimeSegmentEvalJob,
  RealtimeSegmentQueue,
} from "../types";

interface ClaimedRow extends Record<string, unknown> {
  id: string;
  workspaceId: string;
  messageId: string;
  userId: string | null;
  anonymousId: string | null;
  userOrAnonymousId: string;
  eventType: string;
  event: string | null;
  traitPaths: string[];
  propertyPaths: string[];
  payload: Record<string, unknown>;
  eventTime: Date;
  processingTime: Date;
  attempts: number;
}

function toClaimedJob(row: ClaimedRow): ClaimedRealtimeSegmentEvalJob {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    messageId: row.messageId,
    userId: row.userId ?? undefined,
    anonymousId: row.anonymousId ?? undefined,
    userOrAnonymousId: row.userOrAnonymousId,
    eventType: row.eventType,
    event: row.event ?? undefined,
    traitPaths: row.traitPaths,
    propertyPaths: row.propertyPaths,
    payload: row.payload as ClaimedRealtimeSegmentEvalJob["payload"],
    eventTime: row.eventTime,
    processingTime: row.processingTime,
    attempts: row.attempts,
  };
}

export class PostgresRealtimeSegmentQueue implements RealtimeSegmentQueue {
  async enqueue(jobs: RealtimeSegmentEvalJob[]): Promise<void> {
    if (jobs.length === 0) {
      return;
    }
    await db()
      .insert(dbRealtimeSegmentEvalJob)
      .values(
        jobs.map((job) => ({
          workspaceId: job.workspaceId,
          messageId: job.messageId,
          userId: job.userId,
          anonymousId: job.anonymousId,
          userOrAnonymousId: job.userOrAnonymousId,
          eventType: job.eventType,
          event: job.event,
          traitPaths: job.traitPaths,
          propertyPaths: job.propertyPaths,
          payload: job.payload,
          eventTime: job.eventTime,
          processingTime: job.processingTime,
        })),
      )
      .onConflictDoNothing({
        target: [
          dbRealtimeSegmentEvalJob.workspaceId,
          dbRealtimeSegmentEvalJob.messageId,
        ],
      });
  }

  async claim({
    batchSize,
    lockId,
    maxRetries,
  }: {
    batchSize: number;
    lockId: string;
    maxRetries: number;
  }): Promise<ClaimedRealtimeSegmentEvalJob[]> {
    const result = await db().execute<ClaimedRow>(sql`
      WITH claimed AS (
        SELECT ${dbRealtimeSegmentEvalJob.id}
        FROM ${dbRealtimeSegmentEvalJob}
        WHERE
          ${dbRealtimeSegmentEvalJob.status} IN ('Pending', 'Retry')
          AND ${dbRealtimeSegmentEvalJob.availableAt} <= now()
          AND ${dbRealtimeSegmentEvalJob.attempts} < ${maxRetries}
        ORDER BY ${dbRealtimeSegmentEvalJob.availableAt} ASC, ${dbRealtimeSegmentEvalJob.createdAt} ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )
      UPDATE ${dbRealtimeSegmentEvalJob} job
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
        job."messageId" AS "messageId",
        job."userId" AS "userId",
        job."anonymousId" AS "anonymousId",
        job."userOrAnonymousId" AS "userOrAnonymousId",
        job."eventType" AS "eventType",
        job."event" AS "event",
        job."traitPaths" AS "traitPaths",
        job."propertyPaths" AS "propertyPaths",
        job."payload" AS "payload",
        job."eventTime" AS "eventTime",
        job."processingTime" AS "processingTime",
        job."attempts" AS "attempts"
    `);

    return result.rows.map(toClaimedJob);
  }

  async markComplete({
    id,
    lockId,
  }: {
    id: string;
    lockId: string;
  }): Promise<void> {
    await db().execute(sql`
      UPDATE ${dbRealtimeSegmentEvalJob}
      SET
        "status" = 'Completed',
        "lockedAt" = null,
        "lockId" = null,
        "lastError" = null,
        "updatedAt" = now()
      WHERE
        ${dbRealtimeSegmentEvalJob.id} = CAST(${id} AS UUID)
        AND ${dbRealtimeSegmentEvalJob.lockId} = ${lockId}
    `);
  }

  async markFailed({
    id,
    lockId,
    error,
    maxRetries,
  }: {
    id: string;
    lockId: string;
    error: Error;
    maxRetries: number;
  }): Promise<void> {
    await db().execute(sql`
      UPDATE ${dbRealtimeSegmentEvalJob}
      SET
        "status" = CASE
          WHEN "attempts" >= ${maxRetries} THEN 'Failed'
          ELSE 'Retry'
        END,
        "availableAt" = CASE
          WHEN "attempts" >= ${maxRetries} THEN "availableAt"
          ELSE now() + make_interval(secs => LEAST(300, POWER(2, "attempts")::int))
        END,
        "lockedAt" = null,
        "lockId" = null,
        "lastError" = ${error.message},
        "updatedAt" = now()
      WHERE
        ${dbRealtimeSegmentEvalJob.id} = CAST(${id} AS UUID)
        AND ${dbRealtimeSegmentEvalJob.lockId} = ${lockId}
    `);
  }
}
