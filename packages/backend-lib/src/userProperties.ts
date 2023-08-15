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
  PerformedManyValueItem,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyResource,
} from "./types";

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

function processUserProperty(
  definition: UserPropertyDefinition,
  value: JSONValue
): Result<JSONValue, Error> {
  switch (definition.type) {
    case UserPropertyDefinitionType.PerformedMany: {
      if (typeof value !== "string") {
        return err(new Error("performed many value is not a string"));
      }
      const jsonParsedValue = jsonParseSafe(value);
      if (jsonParsedValue.isErr()) {
        logger().error(
          {
            err: jsonParsedValue.error,
          },
          "failed to json parse performed many value"
        );
        return err(jsonParsedValue.error);
      }
      if (!(jsonParsedValue.value instanceof Array)) {
        logger().error("performed many json parsed value is not an array");
        return err(
          new Error("performed many json parsed value is not an array")
        );
      }

      return ok(
        jsonParsedValue.value.flatMap((item) => {
          const result = schemaValidate(item, PerformedManyValueItem);
          if (result.isErr()) {
            logger().error(
              { err: result.error, item, definition },
              "failed to parse performed many item"
            );
            return [];
          }
          const parsedProperties = jsonParseSafe(result.value.properties);
          if (parsedProperties.isErr()) {
            logger().error(
              { err: parsedProperties.error, item, definition },
              "failed to json parse performed many item properties"
            );
            return [];
          }
          return {
            ...result.value,
            properties: parsedProperties.value,
          };
        })
      );
    }
  }
  return ok(value);
}

export function parseUserProperty(
  definition: UserPropertyDefinition,
  value: string
): Result<JSONValue, Error> {
  const parsed = jsonParseSafe(value);
  if (parsed.isErr()) {
    logger().error(
      { err: parsed.error },
      "failed to parse user property assignment"
    );
    return err(parsed.error);
  }
  const processed = processUserProperty(definition, parsed.value);
  if (processed.isErr()) {
    return err(processed.error);
  }
  return ok(processed.value);
}

export async function findAllUserPropertyAssignments({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}): Promise<UserPropertyAssignments> {
  const userProperties = await prisma().userProperty.findMany({
    where: { workspaceId },
    include: {
      UserPropertyAssignment: {
        where: { userId },
      },
    },
  });

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
        continue;
      }
      combinedAssignments[userProperty.name] = parsed.value;
    }
  }

  return combinedAssignments;
}
