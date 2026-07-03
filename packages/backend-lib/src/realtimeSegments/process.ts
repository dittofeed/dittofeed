import { sql } from "drizzle-orm";

import { enqueueRecompute } from "../computedProperties/computePropertiesWorkflow/lifecycle";
import config from "../config";
import { db } from "../db";
import logger from "../logger";
import { findAllSegmentAssignmentsByIds } from "../segments";
import { WorkspaceQueueItemType } from "../types";
import {
  RealtimeSegmentAssignmentChange,
  writeRealtimeSegmentAssignments,
} from "./assignments";
import { scheduleDelayedReevaluations } from "./delayed";
import {
  findRealtimeSegmentCandidates,
  getSegmentDependencies,
} from "./dependencies";
import { evaluateRealtimeSegment } from "./evaluate";
import {
  findRealtimeSegmentMemberships,
  upsertRealtimeSegmentMemberships,
} from "./membership";
import { readRealtimeUserState } from "./state";
import { recordRealtimeSegmentStatus } from "./status";
import { triggerRealtimeSegmentJourneys } from "./triggers";
import { ClaimedRealtimeSegmentEvalJob } from "./types";

export interface RealtimeSegmentProcessResult {
  candidateCount: number;
  evaluatedCount: number;
  unsupportedCount: number;
  writtenCount: number;
  triggeredJourneyCount: number;
  changes: {
    segmentId: string;
    segmentName: string;
    previousInSegment: boolean | null;
    realtimeInSegment: boolean;
    unsupportedNodes: string[];
    changed: boolean;
    written: boolean;
  }[];
}

function mergeDependencies(
  segments: Awaited<ReturnType<typeof findRealtimeSegmentCandidates>>,
) {
  const dependencies = {
    traitPaths: new Set<string>(),
    eventNames: new Set<string>(),
    always: false,
  };

  for (const segment of segments) {
    const segmentDependencies = getSegmentDependencies(segment);
    for (const path of segmentDependencies.traitPaths) {
      dependencies.traitPaths.add(path);
    }
    for (const event of segmentDependencies.eventNames) {
      dependencies.eventNames.add(event);
    }
    dependencies.always ||= segmentDependencies.always;
  }

  return dependencies;
}

async function enqueueUnsupportedSegmentRecompute({
  workspaceId,
  changes,
}: {
  workspaceId: string;
  changes: RealtimeSegmentProcessResult["changes"];
}): Promise<void> {
  const unsupportedSegmentIds = [
    ...new Set(
      changes
        .filter((change) => change.unsupportedNodes.length > 0)
        .map((change) => change.segmentId),
    ),
  ];
  if (unsupportedSegmentIds.length === 0) {
    return;
  }

  try {
    await enqueueRecompute({
      items: unsupportedSegmentIds.map((segmentId) => ({
        type: WorkspaceQueueItemType.Segment,
        workspaceId,
        id: segmentId,
        priority: 15,
      })),
    });
    logger().info(
      {
        workspaceId,
        segmentIds: unsupportedSegmentIds,
      },
      "Enqueued batch recompute for realtime unsupported segments.",
    );
  } catch (err) {
    logger().error(
      {
        err,
        workspaceId,
        segmentIds: unsupportedSegmentIds,
      },
      "Failed to enqueue batch recompute for realtime unsupported segments.",
    );
  }
}

async function withRealtimeUserLock<T>({
  workspaceId,
  userOrAnonymousId,
  fn,
}: {
  workspaceId: string;
  userOrAnonymousId: string;
  fn: () => Promise<T>;
}): Promise<T> {
  const lockKey = `realtime-segment:${workspaceId}:${userOrAnonymousId}`;
  return db().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
    return fn();
  });
}

async function processRealtimeSegmentJobUnlocked({
  job,
  mode = "shadow",
  writeAssignments = false,
  triggerJourneys = false,
}: {
  job: ClaimedRealtimeSegmentEvalJob;
  mode?: string;
  writeAssignments?: boolean;
  triggerJourneys?: boolean;
}): Promise<RealtimeSegmentProcessResult> {
  const candidates = await findRealtimeSegmentCandidates({
    workspaceId: job.workspaceId,
    job,
  });

  if (candidates.length === 0) {
    return {
      candidateCount: 0,
      evaluatedCount: 0,
      unsupportedCount: 0,
      writtenCount: 0,
      triggeredJourneyCount: 0,
      changes: [],
    };
  }

  const state = await readRealtimeUserState({
    workspaceId: job.workspaceId,
    userOrAnonymousId: job.userOrAnonymousId,
    dependencies: mergeDependencies(candidates),
    currentJob: job,
  });
  const candidateSegmentIds = candidates.map((segment) => segment.id);
  const currentMemberships = await findRealtimeSegmentMemberships({
    workspaceId: job.workspaceId,
    userId: job.userOrAnonymousId,
    segmentIds: candidateSegmentIds,
  });
  const currentBySegmentId = new Map(
    currentMemberships.map((membership) => [
      membership.segmentId,
      membership.inSegment,
    ]),
  );
  const currentEventTimeBySegmentId = new Map(
    currentMemberships.map((membership) => [
      membership.segmentId,
      membership.eventTime,
    ]),
  );
  const missingSegmentIds = candidateSegmentIds.filter(
    (segmentId) => !currentBySegmentId.has(segmentId),
  );
  if (missingSegmentIds.length > 0) {
    const currentAssignments = await findAllSegmentAssignmentsByIds({
      workspaceId: job.workspaceId,
      userId: job.userOrAnonymousId,
      segmentIds: missingSegmentIds,
    });
    for (const assignment of currentAssignments) {
      currentBySegmentId.set(assignment.segmentId, assignment.inSegment);
    }
  }

  const evaluatedAt = new Date();
  const assignedAt = evaluatedAt;
  const evaluatedChanges = candidates.map((segment) => {
    const evaluation = evaluateRealtimeSegment({ segment, state });
    const previousInSegment = currentBySegmentId.get(segment.id) ?? null;
    const currentEventTime = currentEventTimeBySegmentId.get(segment.id);
    const staleJob =
      currentEventTime !== undefined && currentEventTime > job.eventTime;
    const supported = evaluation.unsupportedNodes.length === 0;
    const changed =
      supported &&
      !staleJob &&
      previousInSegment !== evaluation.inSegment &&
      (previousInSegment !== null || evaluation.inSegment);
    return {
      segmentId: segment.id,
      segmentName: segment.name,
      previousInSegment,
      realtimeInSegment: evaluation.inSegment,
      unsupportedNodes: evaluation.unsupportedNodes,
      changed,
      written: false,
    };
  });
  const candidateById = new Map(
    candidates.map((segment) => [segment.id, segment]),
  );
  if (config().realtimeSegmentsDelayedReevaluationEnabled) {
    await scheduleDelayedReevaluations({
      workspaceId: job.workspaceId,
      userId: job.userId,
      anonymousId: job.anonymousId,
      state,
      segments: candidates,
      now: evaluatedAt,
    });
  }
  await enqueueUnsupportedSegmentRecompute({
    workspaceId: job.workspaceId,
    changes: evaluatedChanges,
  });
  const assignmentChanges: RealtimeSegmentAssignmentChange[] = evaluatedChanges
    .filter((change) => change.changed)
    .map((change) => ({
      workspaceId: job.workspaceId,
      userId: job.userOrAnonymousId,
      segmentId: change.segmentId,
      inSegment: change.realtimeInSegment,
      maxEventTime: job.eventTime,
      assignedAt,
    }));
  const membershipUpdates: RealtimeSegmentAssignmentChange[] = evaluatedChanges
    .filter((change) => change.unsupportedNodes.length === 0)
    .map((change) => ({
      workspaceId: job.workspaceId,
      userId: job.userOrAnonymousId,
      segmentId: change.segmentId,
      inSegment: change.realtimeInSegment,
      maxEventTime: job.eventTime,
      assignedAt,
    }));

  if (writeAssignments) {
    await writeRealtimeSegmentAssignments(assignmentChanges);
    await upsertRealtimeSegmentMemberships(membershipUpdates);
    for (const change of evaluatedChanges) {
      change.written = assignmentChanges.some(
        (assignment) => assignment.segmentId === change.segmentId,
      );
    }
  }

  let triggeredJourneyCount = 0;
  const triggeredCountBySegmentId = new Map<string, number>();
  if (writeAssignments && triggerJourneys) {
    const triggerCounts = await Promise.all(
      assignmentChanges.map(async (change) => {
        const segment = candidateById.get(change.segmentId);
        if (!segment) {
          return 0;
        }
        const count = await triggerRealtimeSegmentJourneys({ segment, change });
        triggeredCountBySegmentId.set(change.segmentId, count);
        return count;
      }),
    );
    triggeredJourneyCount = triggerCounts.reduce(
      (sum, count) => sum + count,
      0,
    );
  }

  await recordRealtimeSegmentStatus(
    evaluatedChanges.map((change) => {
      const triggeredCount =
        triggeredCountBySegmentId.get(change.segmentId) ?? 0;
      return {
        workspaceId: job.workspaceId,
        segmentId: change.segmentId,
        mode,
        evaluatedAt,
        assignedAt: change.written ? assignedAt : undefined,
        triggeredAt: triggeredCount > 0 ? assignedAt : undefined,
        evaluatedCount: 1,
        assignmentCount: change.written ? 1 : 0,
        triggeredJourneyCount: triggeredCount,
        unsupportedCount: change.unsupportedNodes.length > 0 ? 1 : 0,
      };
    }),
  );

  return {
    candidateCount: candidates.length,
    evaluatedCount: evaluatedChanges.length,
    unsupportedCount: evaluatedChanges.filter(
      (change) => change.unsupportedNodes.length > 0,
    ).length,
    writtenCount: writeAssignments ? assignmentChanges.length : 0,
    triggeredJourneyCount,
    changes: evaluatedChanges,
  };
}

export async function processRealtimeSegmentJob({
  job,
  mode = "shadow",
  writeAssignments = false,
  triggerJourneys = false,
}: {
  job: ClaimedRealtimeSegmentEvalJob;
  mode?: string;
  writeAssignments?: boolean;
  triggerJourneys?: boolean;
}): Promise<RealtimeSegmentProcessResult> {
  return withRealtimeUserLock({
    workspaceId: job.workspaceId,
    userOrAnonymousId: job.userOrAnonymousId,
    fn: () =>
      processRealtimeSegmentJobUnlocked({
        job,
        mode,
        writeAssignments,
        triggerJourneys,
      }),
  });
}
