import { proxyActivities } from "@temporalio/workflow";

// Only import the activity types
import type * as activities from "./temporal/activities";

export interface RestartUserJourneyWorkflowProps {
  workspaceId: string;
  journeyId: string;
  statusUpdatedAt: number;
}

export function generateRestartUserJourneysWorkflowId({
  workspaceId,
  journeyId,
}: RestartUserJourneyWorkflowProps) {
  return `restart-user-journeys-workflow-${workspaceId}-${journeyId}`;
}

const { restartUserJourneysActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
});

export async function restartUserJourneysWorkflow({
  workspaceId,
  journeyId,
  statusUpdatedAt,
}: RestartUserJourneyWorkflowProps) {
  await restartUserJourneysActivity({
    workspaceId,
    journeyId,
    statusUpdatedAt,
  });
}
