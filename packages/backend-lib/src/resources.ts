import { and, asc, eq } from "drizzle-orm";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";

import { db } from "./db";
import * as schema from "./db/schema";
import { getSubscribedSegments } from "./journeys";
import logger from "./logger";
import {
  ChannelType,
  GetJourneysResourcesConfig,
  GetResourcesRequest,
  GetResourcesResponse,
  JourneyDefinition,
  MinimalJourneysResource,
} from "./types";

async function getJourneysResources({
  workspaceId,
  config,
}: {
  workspaceId: string;
  config?: GetJourneysResourcesConfig;
}): Promise<MinimalJourneysResource[]> {
  const journeys = await db().query.journey.findMany({
    columns: {
      id: true,
      name: true,
      definition: true,
    },
    where: eq(schema.journey.workspaceId, workspaceId),
    orderBy: [asc(schema.journey.name)],
  });
  return journeys.flatMap((journey) => {
    const resource: MinimalJourneysResource = {
      id: journey.id,
      name: journey.name,
    };
    if (config?.segments) {
      const definitionResult = schemaValidateWithErr(
        journey.definition,
        JourneyDefinition,
      );
      if (definitionResult.isErr()) {
        logger().error(
          {
            journeyId: journey.id,
            error: definitionResult.error,
          },
          "Invalid journey definition",
        );
        return [];
      }
      const segments = Array.from(
        getSubscribedSegments(definitionResult.value),
      );
      resource.segments = segments;
    }
    return resource;
  });
}

export async function getResources({
  workspaceId,
  segments: shouldGetSegments,
  userProperties: shouldGetUserProperties,
  subscriptionGroups: shouldGetSubscriptionGroups,
  journeys: journeysConfig,
}: GetResourcesRequest): Promise<GetResourcesResponse> {
  const promises: [
    null | Promise<{ id: string; name: string }[]>,
    null | Promise<{ id: string; name: string }[]>,
    null | Promise<{ id: string; name: string; channel: string }[]>,
    null | Promise<JourneysResources[]>,
  ] = [
    shouldGetSegments
      ? db().query.segment.findMany({
          columns: {
            id: true,
            name: true,
          },
          where: and(
            eq(schema.segment.workspaceId, workspaceId),
            eq(schema.segment.resourceType, "Declarative"),
            eq(schema.segment.status, "Running"),
          ),
          orderBy: [asc(schema.segment.name)],
        })
      : null,
    shouldGetUserProperties
      ? db().query.userProperty.findMany({
          columns: {
            id: true,
            name: true,
          },
          where: and(
            eq(schema.userProperty.workspaceId, workspaceId),
            eq(schema.userProperty.resourceType, "Declarative"),
          ),
          orderBy: [asc(schema.userProperty.name)],
        })
      : null,
    shouldGetSubscriptionGroups
      ? db().query.subscriptionGroup.findMany({
          columns: {
            id: true,
            name: true,
            channel: true,
          },
          where: eq(schema.subscriptionGroup.workspaceId, workspaceId),
          orderBy: [asc(schema.subscriptionGroup.name)],
        })
      : null,
    journeysConfig
      ? getJourneysResources({
          workspaceId,
          config:
            typeof journeysConfig === "boolean" ? undefined : journeysConfig,
        })
      : null,
  ];

  const [segments, userProperties, subscriptionGroups, journeys] =
    await Promise.all(promises);

  const response: GetResourcesResponse = {};
  if (segments) {
    response.segments = segments.map((segment) => ({
      id: segment.id,
      name: segment.name,
    }));
  }
  if (userProperties) {
    response.userProperties = userProperties.map((userProperty) => ({
      id: userProperty.id,
      name: userProperty.name,
    }));
  }
  if (subscriptionGroups) {
    response.subscriptionGroups = subscriptionGroups.map(
      (subscriptionGroup) => ({
        id: subscriptionGroup.id,
        name: subscriptionGroup.name,
        channel: subscriptionGroup.channel as ChannelType,
      }),
    );
  }
  if (journeys) {
    response.journeys = journeys;
  }
  return response;
}
