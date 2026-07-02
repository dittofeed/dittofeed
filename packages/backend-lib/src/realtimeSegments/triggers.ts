import { findSubscribedRunningJourneysForSegment } from "../journeys";
import { getJourneyTaskQueue } from "../journeys/taskQueues";
import {
  getUserJourneyWorkflowId,
  segmentUpdateSignal,
  userJourneyWorkflow,
} from "../journeys/userWorkflow";
import logger from "../logger";
import connectWorkflowClient from "../temporal/connectWorkflowClient";
import {
  ComputedAssignment,
  ComputedPropertyAssignment,
  JourneyNodeType,
  SavedSegmentResource,
  SegmentUpdate,
} from "../types";
import { insertProcessedComputedProperties } from "../userEvents/clickhouse";
import { RealtimeSegmentAssignmentChange } from "./assignments";

function toComputedAssignment({
  change,
  journeyId,
}: {
  change: RealtimeSegmentAssignmentChange;
  journeyId: string;
}): ComputedAssignment {
  return {
    workspace_id: change.workspaceId,
    user_id: change.userId,
    type: "segment",
    computed_property_id: change.segmentId,
    latest_segment_value: change.inSegment,
    latest_user_property_value: "",
    max_assigned_at: change.assignedAt.toISOString(),
    processed_for: journeyId,
    processed_for_type: "journey",
  };
}

function toProcessedAssignment(
  assignment: ComputedAssignment,
): ComputedPropertyAssignment {
  return {
    ...assignment,
    segment_value: assignment.latest_segment_value,
    user_property_value: assignment.latest_user_property_value,
  };
}

export async function triggerRealtimeSegmentJourneys({
  segment: _segment,
  change,
}: {
  segment: SavedSegmentResource;
  change: RealtimeSegmentAssignmentChange;
}): Promise<number> {
  if (!change.inSegment) {
    return 0;
  }

  const journeys = await findSubscribedRunningJourneysForSegment({
    workspaceId: change.workspaceId,
    segmentId: change.segmentId,
  });
  if (journeys.length === 0) {
    return 0;
  }

  const workflowClient = await connectWorkflowClient();
  const processedAssignments: ComputedPropertyAssignment[] = [];
  await Promise.all(
    journeys.map(async (journey) => {
      if (
        journey.definition.entryNode.type !== JourneyNodeType.SegmentEntryNode
      ) {
        return;
      }
      const assignment = toComputedAssignment({
        change,
        journeyId: journey.id,
      });
      const segmentUpdate: SegmentUpdate = {
        segmentId: change.segmentId,
        currentlyInSegment: assignment.latest_segment_value,
        segmentVersion: new Date(assignment.max_assigned_at).getTime(),
        type: "segment",
      };
      const workflowId = getUserJourneyWorkflowId({
        journeyId: journey.id,
        userId: change.userId,
      });

      await workflowClient.signalWithStart<
        typeof userJourneyWorkflow,
        [SegmentUpdate]
      >(userJourneyWorkflow, {
        taskQueue: getJourneyTaskQueue(journey.journeyType),
        workflowId,
        args: [
          {
            journeyId: journey.id,
            definition: journey.definition,
            workspaceId: change.workspaceId,
            userId: change.userId,
          },
        ],
        signal: segmentUpdateSignal,
        signalArgs: [segmentUpdate],
      });
      processedAssignments.push(toProcessedAssignment(assignment));
    }),
  );

  await insertProcessedComputedProperties({
    assignments: processedAssignments,
  });
  logger().info(
    {
      workspaceId: change.workspaceId,
      segmentId: change.segmentId,
      userId: change.userId,
      journeyCount: journeys.length,
    },
    "Triggered realtime segment entry journeys.",
  );
  return journeys.length;
}
