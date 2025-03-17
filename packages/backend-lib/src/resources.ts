import { asc, eq } from "drizzle-orm";

import { db } from "./db";
import * as schema from "./db/schema";
import { GetResourcesRequest, GetResourcesResponse } from "./types";

export async function getResources({
  workspaceId,
  segments: shouldGetSegments,
  userProperties: shouldGetUserProperties,
  subscriptionGroups: shouldGetSubscriptionGroups,
}: GetResourcesRequest): Promise<GetResourcesResponse> {
  const promises = [
    shouldGetSegments
      ? db().query.segment.findMany({
          columns: {
            id: true,
            name: true,
          },
          where: eq(schema.segment.workspaceId, workspaceId),
          orderBy: [asc(schema.segment.name)],
        })
      : null,
    shouldGetUserProperties
      ? db().query.userProperty.findMany({
          columns: {
            id: true,
            name: true,
          },
          where: eq(schema.userProperty.workspaceId, workspaceId),
          orderBy: [asc(schema.userProperty.name)],
        })
      : null,
    shouldGetSubscriptionGroups
      ? db().query.subscriptionGroup.findMany({
          columns: {
            id: true,
            name: true,
          },
          where: eq(schema.subscriptionGroup.workspaceId, workspaceId),
          orderBy: [asc(schema.subscriptionGroup.name)],
        })
      : null,
  ];

  const [segments, userProperties, subscriptionGroups] =
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
      }),
    );
  }
  return response;
}
