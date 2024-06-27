import { Prisma, UserProperty, UserPropertyAssignment } from "@prisma/client";
import { ValueError } from "@sinclair/typebox/errors";
import { toJsonPathParam } from "isomorphic-lib/src/jsonPath";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  fileUserPropertyToPerformed,
  parseUserProperty as parseUserPropertyAssignment,
} from "isomorphic-lib/src/userProperties";
import jp from "jsonpath";
import { err, ok, Result } from "neverthrow";

import logger from "./logger";
import prisma from "./prisma";
import {
  EnrichedUserProperty,
  GroupChildrenUserPropertyDefinitions,
  JSONValue,
  PerformedUserPropertyDefinition,
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
      updatedAt: Number(userProperty.updatedAt),
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
  if (typeof assignment === "number") {
    return String(assignment);
  }

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

interface UserPropertyAssignmentOverrideProps {
  userPropertyId: string;
  definition: UserPropertyDefinition;
  context: Record<string, JSONValue>;
}

function getPerformedAssignmentOverride({
  userPropertyId,
  node,
  context,
}: UserPropertyAssignmentOverrideProps & {
  node: PerformedUserPropertyDefinition;
}): JSONValue | null {
  const path = toJsonPathParam({ path: node.path }).unwrapOr(null);
  let value: JSONValue | null = null;
  if (path) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      value = jp.query(context, path)[0] ?? null;
    } catch (e) {
      logger().info(
        {
          userPropertyId,
          err: e,
        },
        "failed to query context for user property assignment override",
      );
      value = null;
    }
  }
  return value;
}

function getAssignmentOverride({
  userPropertyId,
  definition,
  context,
}: UserPropertyAssignmentOverrideProps): JSONValue | null {
  const nodes: UserPropertyDefinition[] = [definition];
  while (nodes.length) {
    const node = nodes.shift();
    if (!node) {
      break;
    }
    if (node.type === UserPropertyDefinitionType.Performed) {
      const value = getPerformedAssignmentOverride({
        userPropertyId,
        node,
        definition,
        context,
      });

      if (value !== null) {
        return value;
      }
    } else if (node.type === UserPropertyDefinitionType.File) {
      const performed = fileUserPropertyToPerformed({
        userProperty: node,
      });
      const value = getPerformedAssignmentOverride({
        userPropertyId,
        node: performed,
        definition,
        context,
      });

      if (value !== null && value instanceof Object) {
        const withName = {
          ...value,
          name: node.name,
        };
        return withName;
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
      ? getAssignmentOverride({
          definition,
          context,
          userPropertyId: userProperty.id,
        })
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

  combinedAssignments.id = combinedAssignments.id ?? userId;
  return combinedAssignments;
}
