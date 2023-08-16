import { updateHubspotEmails } from "backend-lib/src/integrations/hubspotUserWorkflow/activities";
import { randomUUID } from "crypto";
import {
  InternalEventType,
  ParsedPerformedManyValueItem,
} from "isomorphic-lib/src/types";

export async function hubspotSync({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
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
  await updateHubspotEmails({ workspaceId, userId, events });
}
