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

const { restartUserJourneysActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
});

export async function restartUserJourneysWorkflow({
  workspaceId,
  journeyId,
}: RestartUserJourneyWorkflowProps) {
  await restartUserJourneysActivity({
    workspaceId,
    journeyId,
  });
}
