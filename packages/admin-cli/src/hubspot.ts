import { updateHubspotEmails } from "backend-lib/src/integrations/hubspotUserWorkflow/activities";
import {
  getOauthToken,
  refreshToken,
} from "backend-lib/src/integrations/hubspotWorkflow/activities";
import { randomUUID } from "crypto";
import {
  InternalEventType,
  ParsedPerformedManyValueItem,
} from "isomorphic-lib/src/types";

export async function hubspotSync({
  email,
  from,
  workspaceId,
  updateEmail = false,
}: {
  email: string;
  from?: string;
  workspaceId: string;
  updateEmail?: boolean;
}): Promise<void> {
  let token = await getOauthToken({ workspaceId });
  if (!token) {
    throw new Error("no token found");
  }
  token = await refreshToken({ workspaceId, token: token.refreshToken });

  const userId = randomUUID();
  const journeyId = "0a956342-4af8-427c-87f0-e4b0bcafec99";
  const runId = "8f8fd3bf-7dee-4c7f-aaa3-6fd0a2553c67";
  const nodeId1 = "7b05a770-cd95-4ed5-90c0-243d3e48b56c";
  const initialTimestamp = updateEmail
    ? "2023-08-19T17:59:48.882Z"
    : new Date().toISOString();

  const events: ParsedPerformedManyValueItem[] = [
    {
      event: InternalEventType.EmailOpened,
      timestamp: new Date().toISOString(),
      properties: {
        workspaceId,
        journeyId,
        nodeId1,
        runId,
        from,
      },
    },
    {
      event: InternalEventType.EmailDelivered,
      timestamp: new Date().toISOString(),
      properties: {
        workspaceId,
        journeyId,
        nodeId1,
        runId,
        from,
      },
    },
    {
      event: InternalEventType.MessageSent,
      timestamp: initialTimestamp,
      properties: {
        workspaceId,
        journeyId,
        nodeId1,
        runId,
        from,
      },
    },
  ];

  await updateHubspotEmails({
    workspaceId,
    userId,
    events,
    email,
    hubspotAccessToken: token.accessToken,
  });
}
