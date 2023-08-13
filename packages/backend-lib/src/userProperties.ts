import { UserProperty } from "@prisma/client";
import { ValueError } from "@sinclair/typebox/errors";
import {
  jsonParseSafe,
  schemaValidate,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import logger from "./logger";
import prisma from "./prisma";
import {
  EnrichedUserProperty,
  JSONValue,
  UserPropertyDefinition,
  UserPropertyResource,
} from "./types";

export async function upsertComputedProperty() {
  // create computed property pg record
  // create live view in clickhouse
  return null;
}

export async function subscribeToComputedPropery() {
  return null;
}

export function enrichedUserProperty(
  userProperty: UserProperty
): Result<EnrichedUserProperty, ValueError[]> {
  const definitionResult = schemaValidate(
    userProperty.definition,
    UserPropertyDefinition
  );
  if (definitionResult.isErr()) {
    return err(definitionResult.error);
  }
  return ok({
    ...userProperty,
    definition: definitionResult.value,
  });
}

export function toUserPropertyResource(
  userProperty: UserProperty
): Result<UserPropertyResource, ValueError[]> {
  return enrichedUserProperty(userProperty).map(
    ({ workspaceId, name, id, definition }) => ({
      workspaceId,
      name,
      id,
      definition,
    })
  );
}

export async function findAllUserProperties({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<EnrichedUserProperty[]> {
  const userProperties = await prisma().userProperty.findMany({
    where: { workspaceId },
  });

  const enrichedUserProperties: EnrichedUserProperty[] = [];

  for (const userProperty of userProperties) {
    const enrichedJourney = enrichedUserProperty(userProperty);

    if (enrichedJourney.isErr()) {
      logger().error({ err: enrichedJourney.error });
      continue;
    }

    enrichedUserProperties.push(enrichedJourney.value);
  }

  return enrichedUserProperties;
}

export async function findAllUserPropertyAssignments({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
  // TODO change this type when we begin supporting more complex, nested user properties
}): Promise<Record<string, JSONValue>> {
  const assignments = await prisma().userPropertyAssignment.findMany({
    where: { userId, workspaceId },
    include: {
      userProperty: {
        select: {
          name: true,
        },
      },
    },
  });

  const combinedAssignments: Record<string, JSONValue> = {};

  for (const assignment of assignments) {
    const parsed = jsonParseSafe(assignment.value);
    if (parsed.isErr()) {
      logger().error(
        { err: parsed.error },
        "failed to parse user property assignment"
      );
      continue;
    }
    combinedAssignments[assignment.userProperty.name] = parsed.value;
  }

  return combinedAssignments;
}
