/* eslint-disable @typescript-eslint/no-loop-func */
import { Static, Type } from "@sinclair/typebox";
import axios from "axios";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  InternalEventType,
  Nullable,
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
    hs_timestamp: Type.String(),
    hubspot_owner_id: Nullable(Type.String()),
    hs_email_html: Nullable(Type.String()),
    hs_email_subject: Nullable(Type.String()),
    hs_email_to_email: Nullable(Type.String()),
    hs_email_from_email: Nullable(Type.String()),
  }),
});

type HubspotEmail = Static<typeof HubspotEmail>;

interface HubspotCreateEmail {
  properties: {
    hs_timestamp: string;
    hs_email_direction: "EMAIL";
    hs_email_status: string;
    hubspot_owner_id?: string;
    hs_email_subject?: string;
    hs_email_html?: string;
    hs_email_headers: string;
  };
  associations:
    | [
        {
          to: {
            id: string;
          };
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED";
              associationTypeId: 198;
            }
          ];
        }
      ];
}

interface HubspotUpdateEmail {
  id: string;
  properties: {
    hs_email_status: string;
  };
}

interface HubspotCreateEmailBatch {
  items: HubspotCreateEmail[];
}

interface HubspotUpdateEmailBatch {
  items: HubspotUpdateEmail[];
}

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

const HubspotContact = Type.Object({
  id: Type.String(),
  properties: Type.Object({
    email: Type.String(),
  }),
});

const HubspotContactSearchResult = Type.Object({
  results: Type.Array(HubspotContact),
});

type HubspotContactSearchResult = Static<typeof HubspotContactSearchResult>;

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
    properties: [
      "hs_timestamp",
      "hubspot_owner_id",
      "hs_email_html",
      "hs_email_subject",
      "hs_email_to_email",
      "hs_email_from_email",
    ],
  };

  const response = await axios.post(url, data, { headers });
  return schemaValidateWithErr(response.data, HubspotEmailSearchResult);
}

async function searchOwners(
  token: string,
  emails: string[]
): Promise<Result<HubspotOwnerSearchResult, Error>> {
  const url = "https://api.hubapi.com/crm/v3/owners";
  const headers = {
    authorization: `Bearer ${token}`,
  };
  const response = await axios.get(url, { headers });
  return schemaValidateWithErr(response.data, HubspotOwnerSearchResult);
}

async function searchContacts(
  token: string,
  email: string
): Promise<Result<HubspotContactSearchResult, Error>> {
  const url = "https://api.hubapi.com/crm/v3/objects/contact/search";
  const headers = {
    authorization: `Bearer ${token}`,
  };
  const data = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "email",
            operator: "EQ",
            value: email,
          },
        ],
      },
    ],
  };
  logger().debug({ data }, "searchContacts data");
  const response = await axios.post(url, data, { headers });
  return schemaValidateWithErr(response.data, HubspotContactSearchResult);
}

async function updateHubspotEmailsRequest(
  token: string,
  batch: HubspotUpdateEmailBatch
) {
  const url = "https://api.hubapi.com/crm/v3/objects/emails/batch/update";
  const headers = {
    authorization: `Bearer ${token}`,
  };
  await axios.post(url, batch, { headers });
}

async function createHubspotEmailsRequest(
  token: string,
  batch: HubspotCreateEmailBatch
) {
  const url = "https://api.hubapi.com/crm/v3/objects/emails/batch/create";
  const headers = {
    authorization: `Bearer ${token}`,
  };
  const response = await axios.post(url, batch, { headers });
  logger().debug(
    {
      response: response.data,
    },
    "createHubspotEmailsRequest response"
  );
}

async function createHubspotEmailRequest(
  token: string,
  email: HubspotCreateEmail
) {
  const url = "https://api.hubapi.com/crm/v3/objects/emails";
  const headers = {
    authorization: `Bearer ${token}`,
  };
  const response = await axios.post(url, email, { headers });
  logger().debug(
    {
      response: response.data,
    },
    "createHubspotEmailsRequest response"
  );
}

// async function updateHubspotLists() {}

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
  const filteredEvents = events.flatMap((e) => {
    const keyParts = Object.values(
      pick(e.properties, ["workspaceId", "journeyId", "nodeId", "runId"])
    );
    if (!keyParts.length || keyParts.some((p) => !p)) {
      return [];
    }
    return {
      key: keyParts.join("-"),
      ...e,
    };
  });

  const grouped = groupBy(filteredEvents, (event) => event.key);
  const fromEmailAddresses = events.reduce<Set<string>>((memo, event) => {
    const { from } = event.properties;
    if (from) {
      memo.add(from);
    }
    return memo;
  }, new Set());

  const [emailsResult, ownersResult, contactResult] = await Promise.all([
    searchEmails(hubspotAccessToken, email),
    searchOwners(hubspotAccessToken, Array.from(fromEmailAddresses)),
    searchContacts(hubspotAccessToken, email),
  ]);

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
  const contact = contactResult
    .map(
      (r) =>
        r.results.find(
          (contactItem) => contactItem.properties.email === email
        ) ?? null
    )
    .mapErr((e) => {
      logger().error(
        { workspaceId, userId, err: e },
        "error searching contacts"
      );
      return e;
    })
    .unwrapOr(null);

  if (!contact) {
    logger().info({ workspaceId, userId, email }, "no contact found for email");
    return;
  }

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

  const emailUpdates: { id: string; hs_email_status: string }[] = [];
  const newEmails: {
    hs_timestamp: string;
    hubspot_owner_id?: string;
    hs_email_html?: string;
    hs_email_subject?: string;
    hs_email_status: string;
    from?: string;
  }[] = [];

  logger().debug(
    {
      workspaceId,
      userId,
      grouped,
    },
    "hubspot email events"
  );
  for (const key in grouped) {
    const groupedEvents = grouped[key];
    if (!groupedEvents) {
      logger().error("no grouped events");
      continue;
    }
    const earliestMessageSent = groupedEvents.findLast(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      (e) => e.event === InternalEventType.MessageSent
    );

    const hsTimestamp = earliestMessageSent?.timestamp;
    let body: string | undefined;
    let subject: string | undefined;
    let from: string | undefined;
    let status: string | undefined;
    for (const { properties, event } of groupedEvents) {
      if (properties.body && !body) {
        body = properties.body;
      }
      if (properties.subject && !subject) {
        subject = properties.subject;
      }
      if (properties.from && !from) {
        from = properties.from;
      }
      switch (event) {
        case InternalEventType.MessageSent:
          status = "SENDING";
          break;
        case InternalEventType.EmailDelivered:
          status = "SENT";
          break;
        case InternalEventType.EmailBounced:
          status = "BOUNCED";
          break;
        case InternalEventType.MessageFailure:
          status = "FAILED";
          break;
      }
    }
    if (!status) {
      logger().error(
        {
          workspaceId,
          userId,
          events,
        },
        "no status for email event"
      );
      continue;
    }

    const hsOwnerId = from ? owners[from]?.id : undefined;

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
    const hsNumericTimestamp = new Date(hsTimestamp).getTime();
    const existingEmail = emailsResult.value.results.find(
      (e) =>
        new Date(e.properties.hs_timestamp).getTime() === hsNumericTimestamp
    );

    if (existingEmail) {
      emailUpdates.push({
        id: existingEmail.id,
        hs_email_status: status,
      });
    } else {
      newEmails.push({
        hs_timestamp: hsTimestamp,
        hubspot_owner_id: hsOwnerId,
        hs_email_html: body,
        hs_email_subject: subject,
        hs_email_status: status,
        from,
      });
    }
  }
  const updateEmailsBatch: HubspotUpdateEmailBatch = {
    items: emailUpdates.map((e) => ({
      id: e.id,
      properties: { hs_email_status: e.hs_email_status },
    })),
  };
  const createEmailsBatch = newEmails.flatMap((e) =>
    createHubspotEmailRequest(hubspotAccessToken, {
      properties: {
        hs_timestamp: e.hs_timestamp,
        hs_email_direction: "EMAIL",
        hs_email_status: e.hs_email_status,
        hubspot_owner_id: e.hubspot_owner_id,
        hs_email_subject: e.hs_email_subject,
        hs_email_html: e.hs_email_html,
        hs_email_headers: JSON.stringify({
          from: {
            email: e.from,
          },
          to: [{ email }],
          cc: [],
          bcc: [],
        }),
      },
      associations: [
        {
          to: {
            id: contact.id,
          },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: 198,
            },
          ],
        },
      ],
    })
  );

  logger().debug({
    updateEmailsBatch,
    createEmailsBatch,
    emailsResult,
    owners,
    contacts: contactResult.unwrapOr(null),
    contact,
  });
  await Promise.all([
    updateHubspotEmailsRequest(hubspotAccessToken, updateEmailsBatch),
    ...createEmailsBatch,
  ]);
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
