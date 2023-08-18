import { Static, Type } from "@sinclair/typebox";
import axios from "axios";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  InternalEventType,
  ParsedPerformedManyValueItem,
  SegmentUpdate,
} from "isomorphic-lib/src/types";
import { Result } from "neverthrow";
import { groupBy, indexBy, pick } from "remeda";

import { EMAIL_EVENTS_UP_NAME, HUBSPOT_INTEGRATION } from "../../constants";
import logger from "../../logger";
import prisma from "../../prisma";
import { EnrichedUserProperty } from "../../types";
import {
  enrichUserProperty,
  findAllUserPropertyAssignments,
} from "../../userProperties";

const HubspotEmail = Type.Object({
  id: Type.String(),
  properties: Type.Object({
    hs_email_to_email: Type.String(),
    hs_timestamp: Type.String(),
    hs_email_from_email: Type.String(),
    hubspot_owner_id: Type.Optional(Type.String()),
  }),
});

type HubspotEmail = Static<typeof HubspotEmail>;

const HubspotEmailSearchResult = Type.Object({
  results: Type.Array(HubspotEmail),
});

type HubspotEmailSearchResult = Static<typeof HubspotEmailSearchResult>;

const HubspotOwner = Type.Object({
  id: Type.String(),
  email: Type.String(),
});

const HubspotOwnerSearchResult = Type.Object({
  results: Type.Array(HubspotOwner),
});

type HubspotOwnerSearchResult = Static<typeof HubspotOwnerSearchResult>;

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

async function searchEmails(
  token: string,
  recipientEmail: string
): Promise<Result<HubspotEmailSearchResult, Error>> {
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
  return schemaValidateWithErr(response.data, HubspotEmailSearchResult);
}

async function searchOwners(
  token: string,
  emails: string[]
): Promise<Result<HubspotOwnerSearchResult, Error>> {
  const url = "https://api.hubapi.com/crm/v3/objects/owners/search";
  const headers = {
    authorization: `Bearer ${token}`,
  };
  const data = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "hs_email_to_email",
            operator: "IN",
            value: emails,
          },
        ],
      },
    ],
  };
  const response = await axios.post(url, data, { headers });
  return schemaValidateWithErr(response.data, HubspotOwnerSearchResult);
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
  const fromEmailAddresses = events.reduce<Set<string>>((memo, event) => {
    const { from } = event.properties;
    if (from) {
      memo.add(from);
    }
    return memo;
  }, new Set());

  const [emailsResult, ownersResult] = await Promise.all([
    searchEmails(hubspotAccessToken, email),
    searchOwners(hubspotAccessToken, Array.from(fromEmailAddresses)),
  ]);
  const owners = indexBy(
    ownersResult
      .map((r) => r.results)
      .mapErr((e) => {
        logger().error(
          { workspaceId, userId, err: e },
          "error searching owners"
        );
        return e;
      })
      .unwrapOr([]),
    (o) => o.email
  );
  if (emailsResult.isErr()) {
    logger().error(
      {
        err: emailsResult.error,
        workspaceId,
        userId,
      },
      "error searching emails"
    );
    return;
  }

  const emailUpdates: { hubspotId: string; status: string }[] = [];
  const newEmails: {
    hs_timestamp: string;
    hubspot_owner_id?: string;
    hs_email_html?: string;
    hs_email_subject?: string;
    hs_email_status?: string;
  }[] = [];

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
