/* eslint-disable @typescript-eslint/no-loop-func */
import { Static, Type } from "@sinclair/typebox";
import axios, { AxiosError } from "axios";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  InternalEventType,
  Nullable,
  ParsedPerformedManyValueItem,
  SegmentUpdate,
} from "isomorphic-lib/src/types";
import { Result, ok } from "neverthrow";
import { groupBy, indexBy, pick } from "remeda";
import { Overwrite } from "utility-types";

import config from "../../config";
import {
  EMAIL_EVENTS_UP_NAME,
  HUBSPOT_INTEGRATION,
  HUBSPOT_OAUTH_TOKEN,
} from "../../constants";
import logger from "../../logger";
import prisma from "../../prisma";
import { EnrichedUserProperty, OauthToken } from "../../types";
import {
  enrichUserProperty,
  findAllUserPropertyAssignments,
} from "../../userProperties";
import { findEnrichedSegment, findEnrichedSegments } from "../../segments";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

// prevents temporal from automatically serializing Dates to strings
export type SerializableOauthToken = Overwrite<
  OauthToken,
  { createdAt: number; updatedAt: number | null }
>;

export async function getOauthToken({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<SerializableOauthToken | null> {
  const token = await prisma().oauthToken.findUnique({
    where: {
      workspaceId_name: {
        workspaceId,
        name: HUBSPOT_OAUTH_TOKEN,
      },
    },
  });
  if (!token) {
    return null;
  }
  return {
    ...token,
    updatedAt: token.updatedAt.getTime() ?? null,
    createdAt: token.createdAt.getTime(),
  };
}

interface RefreshForm {
  grant_type: "refresh_token";
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  refresh_token: string;
}

export async function refreshToken({
  workspaceId,
  token,
}: {
  workspaceId: string;
  token: string;
}): Promise<SerializableOauthToken> {
  const { dashboardUrl, hubspotClientSecret, hubspotClientId } = config();

  if (!hubspotClientId || !hubspotClientSecret) {
    throw new Error("Hubspot client id or secret not set");
  }
  const formData: RefreshForm = {
    grant_type: "refresh_token",
    client_id: hubspotClientId,
    client_secret: hubspotClientSecret,
    redirect_uri: `${dashboardUrl}/dashboard/oauth2/callback/hubspot`,
    refresh_token: token,
  };

  try {
    const tokenResponse = await axios({
      method: "post",
      url: "https://api.hubapi.com/oauth/v1/token",
      data: formData,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const oauthToken = await prisma().oauthToken.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: HUBSPOT_OAUTH_TOKEN,
        },
      },
      create: {
        workspaceId,
        name: HUBSPOT_OAUTH_TOKEN,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
      },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
      },
    });
    return {
      ...oauthToken,
      createdAt: oauthToken.createdAt.getTime(),
      updatedAt: oauthToken.updatedAt.getTime() ?? null,
    };
  } catch (e) {
    const err = e as AxiosError;
    logger().error(
      {
        err,
        errBody: err.response?.data,
      },
      "Error refreshing Hubspot token"
    );
    throw e;
  }
}

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

async function listOwners(
  token: string
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

async function createHubspotEmailRequest(
  token: string,
  email: HubspotCreateEmail
) {
  const url = "https://api.hubapi.com/crm/v3/objects/emails";
  const headers = {
    authorization: `Bearer ${token}`,
  };
  const response = await axios.post(url, email, { headers });
  return response.data;
}

export async function updateHubspotEmails({
  workspaceId,
  userId,
  events,
}: {
  workspaceId: string;
  userId: string;
  events: ParsedPerformedManyValueItem[];
}) {
  const [hubspotAccessToken, { email }] = await Promise.all([
    getOauthToken({ workspaceId }).then((token) => token?.accessToken),
    findAllUserPropertyAssignments({
      userId,
      workspaceId,
      userProperties: ["email"],
    }),
  ]);
  if (!hubspotAccessToken) {
    logger().info({ workspaceId, userId }, "no hubspot access token");
    return;
  }
  if (!email || typeof email !== "string") {
    logger().info({ workspaceId, userId, email }, "invalid user email");
    return;
  }
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

  const [emailsResult, ownersResult, contactResult] = await Promise.all([
    searchEmails(hubspotAccessToken, email),
    listOwners(hubspotAccessToken),
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
      if (!status) {
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

  await Promise.all([
    updateHubspotEmailsRequest(hubspotAccessToken, updateEmailsBatch),
    ...createEmailsBatch,
  ]);
}

const HubspotList = Type.Object({
  listId: Type.Number(),
  name: Type.String(),
});

type HubspotList = Static<typeof HubspotList>;

const HubspotListSearchResult = Type.Object({
  lists: Type.Array(HubspotList),
  "has-more": Type.Boolean(),
  offset: Type.Number(),
});

type HubspotListSearchResult = Static<typeof HubspotListSearchResult>;

async function fetchHubspotLists(
  token: string,
  offset = 0
): Promise<Result<HubspotListSearchResult, Error>> {
  const url = `https://api.hubapi.com/contacts/v1/lists?count=100&offset=${offset}`;
  const headers = {
    authorization: `Bearer ${token}`,
  };
  const response = await axios.get(url, { headers });
  return schemaValidateWithErr(response.data, HubspotListSearchResult);
}

export async function paginateHubspotLists(
  token: string
): Promise<HubspotList[]> {
  let offset = 0;
  let lists: HubspotList[] = [];
  let count = 0;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const result = await fetchHubspotLists(token, offset);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }
    lists = lists.concat(result.value.lists);
    if (!result.value["has-more"]) {
      break;
    }
    offset = result.value.offset;
    count += 1;
    if (count >= 100) {
      logger().error({ count }, "too many paginations");
      return lists;
    }
  }
  return lists;
}

const HubspotDuplicateListError = Type.Object({
  status: Type.String(),
  category: Type.Literal("VALIDATION_ERROR"),
  subCategory: Type.Literal("ILS.DUPLICATE_LIST_NAMES"),
});

async function createHubspotList({
  token,
  name,
}: {
  token: string;
  name: string;
}): Promise<Result<HubspotList | null, Error>> {
  logger().debug("creating hubspot list");
  const headers = {
    authorization: `Bearer ${token}`,
  };
  try {
    const response = await axios.post(
      "https://api.hubapi.com/contacts/v1/lists",
      {
        name,
      },
      { headers }
    );
    return schemaValidateWithErr(response.data, HubspotList);
  } catch (e) {
    if (!(e instanceof AxiosError)) {
      throw e;
    }
    if (e.response?.status !== 400) {
      throw e;
    }
    const isDuplicateListError = schemaValidateWithErr(
      e.response.data,
      HubspotDuplicateListError
    ).isOk();

    if (!isDuplicateListError) {
      throw e;
    }

    logger().info({ name }, "hubspot list already exists");
    return ok(null);
  }
}

async function addContactToList({
  token,
  listId,
  email,
}: {
  token: string;
  listId: string;
  email: string;
}) {
  const url = `https://api.hubapi.com/contacts/v1/lists/${listId}/add`;
  const headers = {
    authorization: `Bearer ${token}`,
  };
  const data = {
    emails: [email],
  };
  await axios.post(url, data, { headers });
}

async function removeContactFromList({
  token,
  listId,
  email,
}: {
  token: string;
  listId: string;
  email: string;
}) {
  const url = `https://api.hubapi.com/contacts/v1/lists/${listId}/remove`;
  const headers = {
    authorization: `Bearer ${token}`,
  };
  const data = {
    emails: [email],
  };
  const response = await axios.post(url, data, { headers });
  logger().debug(
    { listId, data, email, response: response.data },
    "removing contact from list"
  );
}

function segmentToListName(segmentName: string) {
  return `Dittofeed - ${segmentName}`;
}

export async function updateHubspotLists({
  workspaceId,
  userId,
  segments: segmentUpdates,
}: {
  workspaceId: string;
  userId: string;
  segments: SegmentUpdate[];
}) {
  const [hubspotAccessToken, segments, { email }] = await Promise.all([
    getOauthToken({ workspaceId }),
    findEnrichedSegments({
      workspaceId,
      ids: segmentUpdates.map((s) => s.segmentId),
    }).then(unwrap),
    findAllUserPropertyAssignments({
      workspaceId,
      userId,
      userProperties: ["email"],
    }),
  ]);
  if (!hubspotAccessToken) {
    logger().info({ workspaceId, userId }, "no hubspot access token");
    return;
  }
  if (typeof email !== "string") {
    logger().info({ workspaceId, userId, email }, "invalid user email");
    return;
  }
  let lists = await paginateHubspotLists(hubspotAccessToken.accessToken);
  const listsToCreate = new Set(segments.map((s) => segmentToListName(s.name)));
  for (const list of lists) {
    listsToCreate.delete(list.name);
  }

  const newLists = await Promise.all(
    Array.from(listsToCreate).map((name) =>
      createHubspotList({
        token: hubspotAccessToken.accessToken,
        name,
      })
    )
  );
  for (const newList of newLists) {
    const val = unwrap(newList);
    if (val) {
      lists.push(val);
    }
  }

  await Promise.all(
    segments.flatMap((s) => {
      const update = segmentUpdates.find((su) => su.segmentId === s.id);
      if (!update) {
        logger().error(
          {
            segmentUpdates,
            segment: s,
          },
          "no segment update found for segment"
        );
        return [];
      }
      const listId = lists
        .find((l) => l.name === segmentToListName(s.name))
        ?.listId.toString();

      if (!listId) {
        logger().error({ lists, segment: s }, "no list id found for segment");
        return [];
      }

      if (update.currentlyInSegment) {
        return addContactToList({
          token: hubspotAccessToken.accessToken,
          listId,
          email,
        });
      } else {
        return removeContactFromList({
          token: hubspotAccessToken.accessToken,
          listId,
          email,
        });
      }
    })
  );

  logger().debug({
    lists: lists.map((l) => pick(l, ["name", "listId"])),
    listsToCreate: Array.from(listsToCreate),
    segments,
  });
}
