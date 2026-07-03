import { WorkflowNotFoundError } from "@temporalio/common";

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

function toSegmentUpdate(
  change: RealtimeSegmentAssignmentChange,
): SegmentUpdate {
  return {
    segmentId: change.segmentId,
    currentlyInSegment: change.inSegment,
    segmentVersion: change.assignedAt.getTime(),
    type: "segment",
  };
}

export async function triggerRealtimeSegmentJourneys({
  segment,
  change,
}: {
  segment: SavedSegmentResource;
  change: RealtimeSegmentAssignmentChange;
}): Promise<number> {
  if (!change.inSegment) {
    logger().debug(
      {
        workspaceId: change.workspaceId,
        segmentId: change.segmentId,
        userId: change.userId,
      },
      "Skipping realtime journey trigger for segment exit.",
    );
    return 0;
  }

  const journeys = await findSubscribedRunningJourneysForSegment({
    workspaceId: change.workspaceId,
    segmentId: change.segmentId,
  });
  if (journeys.length === 0) {
    logger().info(
      {
        workspaceId: change.workspaceId,
        segmentId: change.segmentId,
        segmentName: segment.name,
        userId: change.userId,
      },
      "No running journeys subscribed to realtime segment change.",
    );
    return 0;
  }

  const workflowClient = await connectWorkflowClient();
  const processedAssignments: ComputedPropertyAssignment[] = [];
  let triggeredCount = 0;
  let signaledCount = 0;
  await Promise.all(
    journeys.map(async (journey) => {
      const assignment = toComputedAssignment({
        change,
        journeyId: journey.id,
      });
      const segmentUpdate = toSegmentUpdate(change);
      const workflowId = getUserJourneyWorkflowId({
        journeyId: journey.id,
        userId: change.userId,
      });

      if (
        journey.definition.entryNode.type !== JourneyNodeType.SegmentEntryNode
      ) {
        try {
          await workflowClient
            .getHandle(workflowId)
            .signal(segmentUpdateSignal, segmentUpdate);
          processedAssignments.push(toProcessedAssignment(assignment));
          signaledCount += 1;
        } catch (err) {
          if (err instanceof WorkflowNotFoundError) {
            logger().debug(
              {
                workspaceId: change.workspaceId,
                segmentId: change.segmentId,
                userId: change.userId,
                journeyId: journey.id,
                journeyName: journey.name,
                entryNodeType: journey.definition.entryNode.type,
              },
              "No existing user journey workflow to signal for realtime segment update.",
            );
            return;
          }
          throw err;
        }
        return;
      }

      if (journey.definition.entryNode.segment !== change.segmentId) {
        logger().info(
          {
            workspaceId: change.workspaceId,
            segmentId: change.segmentId,
            journeyId: journey.id,
            journeyName: journey.name,
            entrySegmentId: journey.definition.entryNode.segment,
          },
          "Skipping realtime journey trigger for different entry segment.",
        );
        return;
      }

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
      triggeredCount += 1;
    }),
  );

  if (processedAssignments.length > 0) {
    try {
      await insertProcessedComputedProperties({
        assignments: processedAssignments,
      });
    } catch (err) {
      logger().error(
        {
          err,
          workspaceId: change.workspaceId,
          segmentId: change.segmentId,
          userId: change.userId,
          processedAssignmentCount: processedAssignments.length,
        },
        "Failed to record realtime processed journey assignments after triggering journeys.",
      );
    }
  }
  logger().info(
    {
      workspaceId: change.workspaceId,
      segmentId: change.segmentId,
      userId: change.userId,
      journeyCount: journeys.length,
      triggeredCount,
      signaledCount,
    },
    "Processed realtime segment journey updates.",
  );
  return triggeredCount + signaledCount;
}
