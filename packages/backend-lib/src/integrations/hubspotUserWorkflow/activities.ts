import axios from "axios";
import { PerformedManyValue, SegmentUpdate } from "isomorphic-lib/src/types";
import { groupBy } from "remeda";

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

export async function updateHubspotEmails({
  workspaceId,
  userId,
  events,
}: {
  workspaceId: string;
  userId: string;
  events: PerformedManyValue;
}) {
  const filteredEvents = events.filter(
    (event) => event.properties.messageId !== undefined
  );
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
