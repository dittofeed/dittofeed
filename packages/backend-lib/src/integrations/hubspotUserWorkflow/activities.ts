import axios from "axios";
import {
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
