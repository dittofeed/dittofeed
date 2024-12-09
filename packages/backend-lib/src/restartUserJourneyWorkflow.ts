import { proxyActivities } from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "./temporal/activities";
import { JourneyDefinition } from "./types";

export function generateRestartUserJourneysWorkflowId({
  workspaceId,
  journeyId,
}: {
  workspaceId: string;
  journeyId: string;
}) {
  return `restart-user-journeys-workflow-${workspaceId}-${journeyId}`;
}

export function restartUserJourneysWorkflow({
  workspaceId,
  journeyId,
  segmentId,
}: {
  workspaceId: string;
  journeyId: string;
  segmentId: string;
}) {
  // TODO
}
