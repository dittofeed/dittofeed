import { Prisma, UserProperty, UserPropertyAssignment } from "@prisma/client";
import { ValueError } from "@sinclair/typebox/errors";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { parseUserProperty as parseUserPropertyAssignment } from "isomorphic-lib/src/userProperties";
import jp from "jsonpath";
import { err, ok, Result } from "neverthrow";

import { clickhouseClient } from "./clickhouse";
import logger from "./logger";
import prisma from "./prisma";
import {
  ComputedPropertyAssignment,
  EnrichedUserProperty,
  GroupChildrenUserPropertyDefinitions,
  JSONValue,
  SavedUserPropertyResource,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyResource,
} from "./types";

export function enrichUserProperty(
  userProperty: UserProperty,
): Result<EnrichedUserProperty, ValueError[]> {
  const definitionResult = schemaValidate(
    userProperty.definition,
    UserPropertyDefinition,
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
  userProperty: UserProperty,
): Result<UserPropertyResource, ValueError[]> {
  return enrichUserProperty(userProperty).map(
    ({ workspaceId, name, id, definition, exampleValue }) => ({
      workspaceId,
      name,
      id,
      definition,
      exampleValue: exampleValue ?? undefined,
    }),
  );
}

export function toSavedUserPropertyResource(
  userProperty: UserProperty,
): Result<SavedUserPropertyResource, ValueError[]> {
  return enrichUserProperty(userProperty).map(
    ({
      workspaceId,
      name,
      id,
      definition,
      createdAt,
      updatedAt,
      exampleValue,
      definitionUpdatedAt,
    }) => ({
      workspaceId,
      name,
      id,
      definition,
      exampleValue: exampleValue ?? undefined,
      createdAt: createdAt.getTime(),
      updatedAt: updatedAt.getTime(),
      definitionUpdatedAt: definitionUpdatedAt.getTime(),
    }),
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
    const enriched = enrichUserProperty(userProperty);

    if (enriched.isErr()) {
      logger().error({ err: enriched.error });
      continue;
    }

    enrichedUserProperties.push(enriched.value);
  }

  return enrichedUserProperties;
}

export async function findAllPropertyValues({
  propertyId,
  workspaceId,
}: {
  propertyId: string;
  workspaceId: string;
}): Promise<Record<string, string>> {
  const query = `SELECT user_property_value, user_id FROM computed_property_assignments_v2 WHERE (computed_property_id = {propertyId:String}) AND (workspace_id = {workspaceId:String})`;

  const resultSet = await clickhouseClient().query({
    query,
    format: "JSONEachRow",
    query_params: {
      propertyId,
      workspaceId,
    },
  });

  const parsedPropertyAssignments: Record<string, string> = {};

  const result: ComputedPropertyAssignment[] = await resultSet.json();

  for (const computedProperty of result) {
    parsedPropertyAssignments[computedProperty.user_id] =
      computedProperty.user_property_value;
  }

  return parsedPropertyAssignments;
}

export async function findAllUserPropertyResources({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<SavedUserPropertyResource[]> {
  const userProperties = await findAllUserProperties({ workspaceId });

  return userProperties.map((up) => ({
    ...up,
    exampleValue: up.exampleValue ?? undefined,
    definitionUpdatedAt: up.definitionUpdatedAt.getTime(),
    createdAt: up.createdAt.getTime(),
    updatedAt: up.updatedAt.getTime(),
  }));
}

export type UserPropertyAssignments = Record<string, JSONValue>;

export function assignmentAsString(
  assignments: UserPropertyAssignments,
  key: string,
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
  const existing = new Map<string, UserPropertyBulkUpsertItem>();

  for (const item of data) {
    const key = `${item.workspaceId}-${item.userPropertyId}-${item.userId}`;
    if (existing.has(key)) {
      logger().warn(
        {
          existing: existing.get(key),
          new: item,
          workspaceId: item.workspaceId,
        },
        "duplicate user property assignment in bulk upsert",
      );
      continue;
    }
    existing.set(key, item);
  }
  const deduped: UserPropertyBulkUpsertItem[] = Array.from(existing.values());

  const workspaceIds: Prisma.Sql[] = [];
  const userIds: string[] = [];
  const userPropertyIds: Prisma.Sql[] = [];
  const values: string[] = [];

  for (const item of deduped) {
    workspaceIds.push(Prisma.sql`CAST(${item.workspaceId} AS UUID)`);
    userIds.push(item.userId);
    userPropertyIds.push(Prisma.sql`CAST(${item.userPropertyId} AS UUID)`);
    values.push(item.value);
  }

  const joinedUserPropertyIds = Prisma.join(userPropertyIds);

  const query = Prisma.sql`
    WITH unnested_values AS (
        SELECT
            unnest(array[${Prisma.join(workspaceIds)}]) AS "workspaceId",
            unnest(array[${Prisma.join(userIds)}]) as "userId",
            unnest(array[${joinedUserPropertyIds}]) AS "userPropertyId",
            unnest(array[${Prisma.join(values)}]) AS "value"
    )
    INSERT INTO "UserPropertyAssignment" ("workspaceId", "userId", "userPropertyId", "value")
    SELECT
        u."workspaceId",
        u."userId",
        u."userPropertyId",
        u."value"
    FROM unnested_values u
    WHERE EXISTS (
        SELECT 1
        FROM "UserProperty" up
        WHERE up.id = u."userPropertyId"
    )
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

function getAssignmentOverride(
  definition: UserPropertyDefinition,
  context: Record<string, JSONValue>,
): JSONValue | null {
  const nodes: UserPropertyDefinition[] = [definition];
  while (nodes.length) {
    const node = nodes.shift();
    if (!node) {
      break;
    }
    if (node.type === UserPropertyDefinitionType.Performed) {
      const path = `$.${node.path}`;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const value: JSONValue | null = jp.query(context, path)[0] ?? null;
      if (value !== null) {
        return value;
      }
    } else if (node.type === UserPropertyDefinitionType.Group) {
      const groupNodesById: Map<string, GroupChildrenUserPropertyDefinitions> =
        node.nodes.reduce((acc, child) => {
          if (child.id) {
            acc.set(child.id, child);
          }
          return acc;
        }, new Map<string, GroupChildrenUserPropertyDefinitions>());

      const groupParent = groupNodesById.get(node.entry);
      if (groupParent?.type !== UserPropertyDefinitionType.AnyOf) {
        continue;
      }
      for (const childId of groupParent.children) {
        const child = groupNodesById.get(childId);
        if (child?.type === UserPropertyDefinitionType.Performed) {
          nodes.push(child);
        }
      }
    }
  }

  return null;
}

export async function findAllUserPropertyAssignments({
  userId,
  workspaceId,
  userProperties: userPropertiesFilter,
  context,
}: {
  userId: string;
  workspaceId: string;
  userProperties?: string[];
  context?: Record<string, JSONValue>;
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

  const combinedAssignments: UserPropertyAssignments = {};

  for (const userProperty of userProperties) {
    const definitionResult = schemaValidate(
      userProperty.definition,
      UserPropertyDefinition,
    );
    if (definitionResult.isErr()) {
      logger().error(
        { err: definitionResult.error, workspaceId, userProperty },
        "failed to parse user property definition",
      );
      continue;
    }
    const definition = definitionResult.value;
    const contextAssignment = context
      ? getAssignmentOverride(definition, context)
      : null;
    if (contextAssignment !== null) {
      combinedAssignments[userProperty.name] = contextAssignment;
    } else {
      const assignments = userProperty.UserPropertyAssignment;
      const assignment = assignments[0];
      if (assignment) {
        const parsed = parseUserPropertyAssignment(
          definition,
          assignment.value,
        );
        if (parsed.isErr()) {
          logger().error(
            {
              err: parsed.error,
              workspaceId,
              userProperty,
              assignment,
            },
            "failed to parse user property assignment",
          );
          continue;
        }
        combinedAssignments[userProperty.name] = parsed.value;
      }
    }
  }
  logger().debug(
    {
      userId,
      userProperties,
      combinedAssignments,
    },
    "findAllUserPropertyAssignments",
  );

  return combinedAssignments;
}
