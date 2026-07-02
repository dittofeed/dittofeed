import { findAllSegmentAssignmentsByIds } from "../segments";
import {
  RealtimeSegmentAssignmentChange,
  writeRealtimeSegmentAssignments,
} from "./assignments";
import {
  findRealtimeSegmentCandidates,
  getSegmentDependencies,
} from "./dependencies";
import { evaluateRealtimeSegment } from "./evaluate";
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
  const currentAssignments = await findAllSegmentAssignmentsByIds({
    workspaceId: job.workspaceId,
    userId: job.userOrAnonymousId,
    segmentIds: candidates.map((segment) => segment.id),
  });
  const currentBySegmentId = new Map(
    currentAssignments.map((assignment) => [
      assignment.segmentId,
      assignment.inSegment,
    ]),
  );

  const evaluatedAt = new Date();
  const assignedAt = evaluatedAt;
  const evaluatedChanges = candidates.map((segment) => {
    const evaluation = evaluateRealtimeSegment({ segment, state });
    const previousInSegment = currentBySegmentId.get(segment.id) ?? null;
    const supported = evaluation.unsupportedNodes.length === 0;
    const changed =
      supported &&
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

  if (writeAssignments) {
    await writeRealtimeSegmentAssignments(assignmentChanges);
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
