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
  workspaceId,
}: {
  email: string;
  workspaceId: string;
}): Promise<void> {
  console.log("hubspot sync getting token");
  let token = await getOauthToken({ workspaceId });
  if (!token) {
    throw new Error("no token found");
  }
  console.log("hubspot sync refreshing token");
  token = await refreshToken({ workspaceId, token: token.refreshToken });

  const userId = randomUUID();
  const events: ParsedPerformedManyValueItem[] = [
    {
      event: InternalEventType.MessageSent,
      timestamp: new Date().toISOString(),
      properties: {},
    },
    {
      event: InternalEventType.EmailDelivered,
      timestamp: new Date().toISOString(),
      properties: {},
    },
    {
      event: InternalEventType.EmailOpened,
      timestamp: new Date().toISOString(),
      properties: {},
    },
  ];
  console.log("hubspot sync updating emails");
  await updateHubspotEmails({
    workspaceId,
    userId,
    events,
    email,
    hubspotAccessToken: token.accessToken,
  });
}
