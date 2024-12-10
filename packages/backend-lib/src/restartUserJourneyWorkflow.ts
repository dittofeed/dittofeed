import { proxyActivities } from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "./temporal/activities";
import { JourneyDefinition } from "./types";

export type RestartUserJourneyWorkflowProps = {
  workspaceId: string;
  journeyId: string;
};

export function generateRestartUserJourneysWorkflowId({
  workspaceId,
  journeyId,
}: RestartUserJourneyWorkflowProps) {
  return `restart-user-journeys-workflow-${workspaceId}-${journeyId}`;
}

export async function restartUserJourneysWorkflow({
  workspaceId,
  journeyId,
}: RestartUserJourneyWorkflowProps) {}
