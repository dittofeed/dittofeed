import { UserProperty } from "@prisma/client";
import { ValueError } from "@sinclair/typebox/errors";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import logger from "./logger";
import prisma from "./prisma";
import { EnrichedUserProperty, UserPropertyDefinition } from "./types";

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
}: {
  userId: string;
}): Promise<Record<string, string>> {
  const assignments = await prisma().userPropertyAssignment.findMany({
    where: { userId },
    include: {
      userProperty: {
        select: {
          name: true,
        },
      },
    },
  });

  const combinedAssignments: Record<string, string> = {};

  for (const assignment of assignments) {
    combinedAssignments[assignment.userProperty.name] = assignment.value;
  }

  return combinedAssignments;
}
