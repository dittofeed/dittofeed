import { Prisma, UserProperty, UserPropertyAssignment } from "@prisma/client";
import { ValueError } from "@sinclair/typebox/errors";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { parseUserProperty } from "isomorphic-lib/src/userProperties";
import { err, ok, Result } from "neverthrow";

import logger from "./logger";
import prisma from "./prisma";
import {
  EnrichedUserProperty,
  JSONValue,
  UserPropertyDefinition,
  UserPropertyResource,
} from "./types";

export function enrichUserProperty(
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
  return enrichUserProperty(userProperty).map(
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
    const enrichedJourney = enrichUserProperty(userProperty);

    if (enrichedJourney.isErr()) {
      logger().error({ err: enrichedJourney.error });
      continue;
    }

    enrichedUserProperties.push(enrichedJourney.value);
  }

  return enrichedUserProperties;
}

export type UserPropertyAssignments = Record<string, JSONValue>;

export function assignmentAsString(
  assignments: UserPropertyAssignments,
  key: string
): string | null {
  const assignment = assignments[key];
  if (typeof assignment !== "string") {
    return null;
  }
  return assignment;
}

export type UserPropertyBulkUpsertItem = Pick<
  UserPropertyAssignment,
  "workspaceId" | "userId" | "userPropertyId" | "value"
>;

export async function upsertBulkUserPropertyAssignments({
  data,
}: {
  data: UserPropertyBulkUpsertItem[];
}) {
  if (data.length === 0) {
    return;
  }
  const workspaceIds: Prisma.Sql[] = [];
  const userIds: string[] = [];
  const userPropertyIds: Prisma.Sql[] = [];
  const values: string[] = [];

  for (const item of data) {
    workspaceIds.push(Prisma.sql`CAST(${item.workspaceId} AS UUID)`);
    userIds.push(item.userId);
    userPropertyIds.push(Prisma.sql`CAST(${item.userPropertyId} AS UUID)`);
    values.push(item.value);
  }

  const query = Prisma.sql`
    INSERT INTO "UserPropertyAssignment" ("workspaceId", "userId", "userPropertyId", "value")
    SELECT 
      unnest(array[${Prisma.join(workspaceIds)}])::uuid,
      unnest(array[${Prisma.join(userIds)}])::text,
      unnest(array[${Prisma.join(userPropertyIds)}])::uuid,
      unnest(array[${Prisma.join(values)}])::text
    ON CONFLICT ("workspaceId", "userId", "userPropertyId")
    DO UPDATE SET
      "value" = EXCLUDED."value"
  `;

  try {
    await prisma().$executeRaw(query);
  } catch (e) {
    if (
      !(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003")
    ) {
      throw e;
    }
  }
}

export async function findAllUserPropertyAssignments({
  userId,
  workspaceId,
  userProperties: userPropertiesFilter,
}: {
  userId: string;
  workspaceId: string;
  userProperties?: string[];
}): Promise<UserPropertyAssignments> {
  const where: Prisma.UserPropertyWhereInput = {
    workspaceId,
  };
  if (userPropertiesFilter?.length) {
    where.name = {
      in: userPropertiesFilter,
    };
  }

  const userProperties = await prisma().userProperty.findMany({
    where,
    include: {
      UserPropertyAssignment: {
        where: { userId },
      },
    },
  });

  logger().debug(
    {
      userProperties,
    },
    "findAllUserPropertyAssignments"
  );
  const combinedAssignments: UserPropertyAssignments = {};

  for (const userProperty of userProperties) {
    const definitionResult = schemaValidate(
      userProperty.definition,
      UserPropertyDefinition
    );
    if (definitionResult.isErr()) {
      logger().error(
        { err: definitionResult.error, workspaceId, userProperty },
        "failed to parse user property definition"
      );
      continue;
    }
    const definition = definitionResult.value;
    const assignments = userProperty.UserPropertyAssignment;

    for (const assignment of assignments) {
      const parsed = parseUserProperty(definition, assignment.value);
      if (parsed.isErr()) {
        logger().error(
          {
            err: parsed.error,
            workspaceId,
            userProperty,
            assignment,
          },
          "failed to parse user property assignment"
        );
        continue;
      }
      combinedAssignments[userProperty.name] = parsed.value;
    }
  }

  return combinedAssignments;
}
