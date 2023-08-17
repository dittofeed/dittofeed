import { Type } from "@sinclair/typebox";
import axios from "axios";
import {
  InternalEventType,
  ParsedPerformedManyValueItem,
  PerformedManyValue,
  SegmentUpdate,
} from "isomorphic-lib/src/types";
import { groupBy, pick } from "remeda";

import { EMAIL_EVENTS_UP_NAME, HUBSPOT_INTEGRATION } from "../../constants";
import logger from "../../logger";
import prisma from "../../prisma";
import { EnrichedUserProperty } from "../../types";
import {
  enrichUserProperty,
  findAllUserPropertyAssignments,
} from "../../userProperties";

const HUBSPOT_EMAIL = Type.Object({
  id: Type.String(),
  properties: Type.Object({
    hs_email_to_email: Type.String(),
    hs_email_from_email: Type.String(),
    hubspot_owner_id: Type.Optional(Type.String()),
  }),
});

export async function findEmailEventsUserProperty({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<EnrichedUserProperty | null> {
  const up = await prisma().userProperty.findUnique({
    where: {
      workspaceId_name: {
        workspaceId,
        name: EMAIL_EVENTS_UP_NAME,
      },
    },
  });
  if (!up) {
    return null;
  }
  const enrichedResult = enrichUserProperty(up);
  if (enrichedResult.isErr()) {
    logger().error(
      { err: enrichedResult.error },
      "error enriching user property"
    );
    return null;
  }
  return enrichedResult.value;
}

export async function getIntegrationEnabled({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<boolean> {
  return (
    (
      await prisma().integration.findUnique({
        where: {
          workspaceId_name: {
            workspaceId,
            name: HUBSPOT_INTEGRATION,
          },
        },
      })
    )?.enabled === true
  );
}

async function searchEmails(token: string, recipientEmail: string) {
  const url = "https://api.hubapi.com/crm/v3/objects/emails/search";
  const headers = {
    authorization: `Bearer ${token}`,
  };
  const data = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "hs_email_to_email",
            operator: "EQ",
            value: recipientEmail,
          },
        ],
      },
    ],
  };

  const response = await axios.post(url, data, { headers });
  return response.data;
}

const RELEVANT_EMAIL_EVENTS = new Set([
  InternalEventType.MessageSent,
  InternalEventType.EmailDelivered,
  InternalEventType.EmailBounced,
  InternalEventType.MessageFailure,
]);

export async function updateHubspotEmails({
  workspaceId,
  userId,
  events,
  email,
  hubspotAccessToken,
}: {
  workspaceId: string;
  userId: string;
  events: ParsedPerformedManyValueItem[];
  email: string;
  hubspotAccessToken: string;
}) {
  console.log("updateHubspotEmails");
  // BOUNCED, FAILED, SCHEDULED, SENDING, or SENT.
  // SENDING = sent, sent = delivered
  const filteredEvents = events
    .filter((event) => event.properties.messageId !== undefined)
    .map((e) => ({
      key: Object.values(
        pick(e.properties, ["workspaceId", "journeyId", "nodeId", "runId"])
      ).join("-"),
      event: e.event,
      timestamp: e.timestamp,
    }));

  const grouped = groupBy(filteredEvents, (event) => event.key);
  const emails = await searchEmails(hubspotAccessToken, email);
  console.log("emails", emails);

  for (const key in grouped) {
    const groupedEvents = grouped[key];
    if (!groupedEvents) {
      continue;
    }

    const hsTimestamp = groupedEvents.find(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      (e) => e.event === InternalEventType.MessageSent
    )?.timestamp;

    if (!hsTimestamp) {
      logger().error(
        {
          workspaceId,
          userId,
          events,
        },
        "no message sent event for user hubspot email"
      );
      continue;
    }
  }

  // workspaceId: string;
  // runId: string;
  // nodeId: string;
  // templateId: string;
  // journeyId: string;
  // messageId: string;
  // subscriptionGroupId?: string;
}

export async function updateHubspotLists({
  workspaceId,
  userId,
  segments,
}: {
  workspaceId: string;
  userId: string;
  segments: SegmentUpdate[];
}) {
  const upa = findAllUserPropertyAssignments({
    workspaceId,
    userId,
  });
}
