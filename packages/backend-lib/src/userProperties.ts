import { ValueError } from "@sinclair/typebox/errors";
import { randomUUID } from "crypto";
import { and, eq, inArray, or, SQL } from "drizzle-orm";
import { toJsonPathParam } from "isomorphic-lib/src/jsonPath";
import protectedUserProperties from "isomorphic-lib/src/protectedUserProperties";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  fileUserPropertyToPerformed,
  parseUserProperty as parseUserPropertyAssignment,
} from "isomorphic-lib/src/userProperties";
import jp from "jsonpath";
import { err, ok, Result } from "neverthrow";
import { PostgresError } from "pg-error-enum";
import { validate as validateUuid } from "uuid";

import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  query as chQuery,
} from "./clickhouse";
import { assignmentSequentialConsistency } from "./config";
import { db, QueryError, queryResult, upsert } from "./db";
import { userProperty as dbUserProperty } from "./db/schema";
import logger from "./logger";
import {
  EnrichedUserProperty,
  GroupChildrenUserPropertyDefinitions,
  JSONValue,
  KeyedPerformedUserPropertyDefinition,
  PerformedUserPropertyDefinition,
  SavedUserPropertyResource,
  UpsertUserPropertyError,
  UpsertUserPropertyErrorType,
  UpsertUserPropertyResource,
  UserProperty,
  UserPropertyAssignment,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyOperatorType,
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
  requireRunning = false,
  ids,
  names,
}: {
  workspaceId: string;
  requireRunning?: boolean;
  ids?: string[];
  names?: string[];
}): Promise<EnrichedUserProperty[]> {
  const conditions: SQL[] = [eq(dbUserProperty.workspaceId, workspaceId)];
  if (requireRunning) {
    conditions.push(eq(dbUserProperty.status, "Running"));
  }
  const identifierConditions: SQL[] = [];
  if (ids?.length) {
    identifierConditions.push(inArray(dbUserProperty.id, ids));
  }
  if (names?.length) {
    identifierConditions.push(inArray(dbUserProperty.name, names));
  }
  const identifierWhere: SQL | undefined = or(...identifierConditions);
  if (identifierWhere) {
    conditions.push(identifierWhere);
  }
  const where = and(...conditions);
  const userProperties = await db().select().from(dbUserProperty).where(where);

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
  requireRunning,
  ids,
}: {
  workspaceId: string;
  requireRunning?: boolean;
  ids?: string[];
  names?: string[];
}): Promise<SavedUserPropertyResource[]> {
  const userProperties = await findAllUserProperties({
    workspaceId,
    requireRunning,
    ids: ids?.length ? ids : undefined,
    names: names?.length ? names : undefined,
  });

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

interface UserPropertyAssignmentOverrideProps {
  userPropertyId: string;
  definition: UserPropertyDefinition;
  context: Record<string, JSONValue>[];
}

function getPerformedAssignmentOverride({
  userPropertyId,
  node,
  context,
}: UserPropertyAssignmentOverrideProps & {
  node: PerformedUserPropertyDefinition | KeyedPerformedUserPropertyDefinition;
}): JSONValue | null {
  const path = toJsonPathParam({ path: node.path }).unwrapOr(null);
  let value: JSONValue | null = null;
  // assuming events are ordered by timestamps ascending want to check the most
  // recent event contexts first
  for (let i = context.length - 1; i >= 0; i--) {
    const ctxItem = context[i];
    if (path) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const queried = jp.query(ctxItem, path)[0];
        if (queried === undefined) {
          continue;
        }
        let matches = true;
        for (const property of node.properties ?? []) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const queriedForProperty = jp.query(ctxItem, property.path)[0];
          const { operator } = property;
          switch (operator.type) {
            case UserPropertyOperatorType.Equals:
              matches = queriedForProperty === operator.value;
              break;
            default:
              assertUnreachable(operator.type);
          }

          if (!matches) {
            break;
          }
        }

        if (!matches) {
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        value = queried;
        break;
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
    if (
      node.type === UserPropertyDefinitionType.Performed ||
      node.type === UserPropertyDefinitionType.KeyedPerformed
    ) {
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
        logger().error(
          { node },
          "getAssignmentOverride group parent is not an AnyOf",
        );
        continue;
      }
      for (const childId of groupParent.children) {
        const child = groupNodesById.get(childId);
        if (
          child?.type === UserPropertyDefinitionType.Performed ||
          child?.type === UserPropertyDefinitionType.KeyedPerformed
        ) {
          nodes.push(child);
        }
      }
    }
  }

  return null;
}

function transformAssignmentValue({
  workspaceId,
  userPropertyId,
  definition,
  context,
  assignment,
}: {
  workspaceId: string;
  userPropertyId: string;
  definition: UserPropertyDefinition;
  context?: Record<string, JSONValue>[];
  assignment?: string;
}): JSONValue {
  const contextAssignment = context
    ? getAssignmentOverride({
        definition,
        context,
        userPropertyId,
      })
    : null;
  let transformed: JSONValue = null;
  if (contextAssignment !== null) {
    transformed = contextAssignment;
  } else if (assignment) {
    const parsed = parseUserPropertyAssignment(definition, assignment);
    if (parsed.isErr()) {
      logger().error(
        {
          err: parsed.error,
          workspaceId,
          userPropertyId,
          assignment,
        },
        "failed to parse user property assignment",
      );
    } else {
      transformed = parsed.value;
    }
  }
  return transformed;
}

interface ClickhouseUserPropertyAssignment {
  computed_property_id: string;
  last_value: string;
}

export interface FindAllUserPropertyAssignmentsProps {
  userId: string;
  workspaceId: string;
  userProperties?: string[];
  userPropertyIds?: string[];
  context?: Record<string, JSONValue>[];
}

async function findAllUserPropertyAssignmentsComponents({
  userId,
  workspaceId,
  userProperties: userPropertiesFilter,
  userPropertyIds,
}: Omit<FindAllUserPropertyAssignmentsProps, "context">): Promise<{
  userProperties: UserProperty[];
  assignmentMap: Map<string, string>;
}> {
  const conditions: SQL[] = [eq(dbUserProperty.workspaceId, workspaceId)];
  if (userPropertiesFilter?.length) {
    conditions.push(inArray(dbUserProperty.name, userPropertiesFilter));
  } else if (userPropertyIds?.length) {
    conditions.push(inArray(dbUserProperty.id, userPropertyIds));
  }
  const where = and(...conditions);
  const userProperties = await db().select().from(dbUserProperty).where(where);

  const qb = new ClickHouseQueryBuilder();
  const query = `
    select
      computed_property_id,
      argMax(user_property_value, assigned_at) as last_value
    from computed_property_assignments_v2
    where
      workspace_id = ${qb.addQueryValue(workspaceId, "String")}
      and user_id = ${qb.addQueryValue(userId, "String")}
      and type = 'user_property'
      and computed_property_id in (${qb.addQueryValue(
        userProperties.map((up) => up.id),
        "Array(String)",
      )})
    group by computed_property_id
    having last_value != ''
  `;
  const result = await chQuery({
    query,
    query_params: qb.getQueries(),
    clickhouse_settings: {
      select_sequential_consistency: assignmentSequentialConsistency(),
    },
  });
  const rows = await result.json<ClickhouseUserPropertyAssignment>();
  const chAssignmentMap = new Map<string, string>();
  for (const row of rows) {
    chAssignmentMap.set(row.computed_property_id, row.last_value);
  }
  return {
    userProperties,
    assignmentMap: chAssignmentMap,
  };
}

export async function findAllUserPropertyAssignments({
  userId,
  workspaceId,
  userProperties: userPropertiesFilter,
  context,
  userPropertyIds,
}: FindAllUserPropertyAssignmentsProps): Promise<UserPropertyAssignments> {
  const { userProperties, assignmentMap } =
    await findAllUserPropertyAssignmentsComponents({
      userId,
      workspaceId,
      userProperties: userPropertiesFilter,
      userPropertyIds,
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
    const transformed = transformAssignmentValue({
      workspaceId,
      userPropertyId: userProperty.id,
      definition,
      context,
      assignment: assignmentMap.get(userProperty.id),
    });

    if (transformed !== null) {
      combinedAssignments[userProperty.name] = transformed;
    }
  }

  combinedAssignments.id = combinedAssignments.id ?? userId;
  return combinedAssignments;
}

/**
 *
 * @param param0
 * @returns record from user id to property name to property value
 */
export async function findAllUserPropertyAssignmentsForWorkspace({
  workspaceId,
  userProperties: userPropertiesFilter,
  context,
}: {
  workspaceId: string;
  userProperties?: string[];
  context?: Record<string, JSONValue>[];
}): Promise<Record<string, UserPropertyAssignments>> {
  const conditions: SQL[] = [eq(dbUserProperty.workspaceId, workspaceId)];
  if (userPropertiesFilter?.length) {
    conditions.push(inArray(dbUserProperty.name, userPropertiesFilter));
  }
  const where = and(...conditions);
  const userProperties = await db().select().from(dbUserProperty).where(where);

  const qb = new ClickHouseQueryBuilder();
  const query = `
    select
      computed_property_id,
      user_id,
      argMax(user_property_value, assigned_at) as last_value
    from computed_property_assignments_v2
    where
      workspace_id = ${qb.addQueryValue(workspaceId, "String")}
      and type = 'user_property'
      and computed_property_id in (${qb.addQueryValue(
        userProperties.map((up) => up.id),
        "Array(String)",
      )})
    group by computed_property_id, user_id
    having last_value != ''
  `;
  const result = await chQuery({
    query,
    query_params: qb.getQueries(),
    clickhouse_settings: {
      select_sequential_consistency: assignmentSequentialConsistency(),
    },
  });
  const rows = await result.json<{
    computed_property_id: string;
    user_id: string;
    last_value: string;
  }>();
  const chAssignmentMap = new Map<
    string,
    { userId: string; value: string }[]
  >();

  for (const row of rows) {
    const existing = chAssignmentMap.get(row.computed_property_id);
    if (existing) {
      existing.push({
        userId: row.user_id,
        value: row.last_value,
      });
    } else {
      chAssignmentMap.set(row.computed_property_id, [
        { userId: row.user_id, value: row.last_value },
      ]);
    }
  }

  const combinedAssignments: Record<string, UserPropertyAssignments> = {};

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
    const assignments = chAssignmentMap.get(userProperty.id);
    if (!assignments) {
      continue;
    }
    for (const assignment of assignments) {
      const transformedForUser: Record<string, JSONValue> =
        combinedAssignments[assignment.userId] ?? {};

      const transformed = transformAssignmentValue({
        workspaceId,
        userPropertyId: userProperty.id,
        definition,
        context,
        assignment: assignment.value,
      });
      transformedForUser[userProperty.name] = transformed;
      combinedAssignments[assignment.userId] = transformedForUser;
    }
  }

  for (const userId of Object.keys(combinedAssignments)) {
    const assignmentsForUser = combinedAssignments[userId];
    if (!assignmentsForUser) {
      continue;
    }
    assignmentsForUser.id = assignmentsForUser.id ?? userId;
  }

  return combinedAssignments;
}

export async function findAllUserPropertyAssignmentsById({
  userId,
  workspaceId,
  userProperties: userPropertiesFilter,
  context,
  userPropertyIds,
}: FindAllUserPropertyAssignmentsProps): Promise<UserPropertyAssignments> {
  const { userProperties, assignmentMap } =
    await findAllUserPropertyAssignmentsComponents({
      userId,
      workspaceId,
      userProperties: userPropertiesFilter,
      userPropertyIds,
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
      combinedAssignments[userProperty.id] = contextAssignment;
    } else {
      const assignment = assignmentMap.get(userProperty.id);
      if (assignment) {
        const parsed = parseUserPropertyAssignment(definition, assignment);
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
        combinedAssignments[userProperty.id] = parsed.value;
      }
    }
  }

  combinedAssignments.id = combinedAssignments.id ?? userId;
  return combinedAssignments;
}

export async function upsertUserProperty(
  params: UpsertUserPropertyResource,
): Promise<Result<SavedUserPropertyResource, UpsertUserPropertyError>> {
  const {
    id,
    name,
    definition,
    workspaceId,
    exampleValue,
  }: UpsertUserPropertyResource = params;
  if (id && !validateUuid(id)) {
    return err({
      type: UpsertUserPropertyErrorType.IdError,
      message: "Invalid user property id, must be a valid v4 UUID",
    });
  }

  const canCreate = workspaceId && name && definition;
  const definitionUpdatedAt = definition ? new Date() : undefined;

  if (protectedUserProperties.has(name)) {
    return err({
      type: UpsertUserPropertyErrorType.ProtectedUserProperty,
      message: "User property name is protected",
    });
  }

  let result: Result<UserProperty, QueryError>;
  if (canCreate) {
    if (id) {
      result = await upsert({
        table: dbUserProperty,
        values: {
          id,
          workspaceId,
          name,
          definition,
          exampleValue,
          definitionUpdatedAt,
        },
        target: [dbUserProperty.id],
        setWhere: eq(dbUserProperty.workspaceId, workspaceId),
        set: {
          name,
          definition,
          definitionUpdatedAt,
          exampleValue,
        },
      });
    } else {
      result = await upsert({
        table: dbUserProperty,
        values: {
          id: randomUUID(),
          workspaceId,
          name,
          definition,
          exampleValue,
        },
        set: {
          definition,
          definitionUpdatedAt,
          exampleValue,
        },
        target: [dbUserProperty.workspaceId, dbUserProperty.name],
      });
    }
  } else {
    let updateResult: Result<UserProperty[], QueryError>;
    if (id) {
      updateResult = await queryResult(
        db()
          .update(dbUserProperty)
          .set({
            definition,
            definitionUpdatedAt,
            exampleValue,
          })
          .where(eq(dbUserProperty.id, id))
          .returning(),
      );
    } else {
      updateResult = await queryResult(
        db()
          .update(dbUserProperty)
          .set({
            definition,
            definitionUpdatedAt,
            exampleValue,
          })
          .where(
            and(
              eq(dbUserProperty.workspaceId, workspaceId),
              eq(dbUserProperty.name, name),
            ),
          )
          .returning(),
      );
    }
    result = updateResult.map((r) => {
      if (!r[0]) {
        logger().error(
          { workspaceId, name, id },
          "failed to update user property",
        );
        throw new Error("No result returned from update");
      }
      return r[0];
    });
  }
  if (result.isErr()) {
    if (
      result.error.code === PostgresError.FOREIGN_KEY_VIOLATION ||
      result.error.code === PostgresError.UNIQUE_VIOLATION
    ) {
      return err({
        type: UpsertUserPropertyErrorType.UserPropertyAlreadyExists,
        message:
          "Names must be unique in workspace. Id's must be globally unique.",
      });
    }
    throw result.error;
  }

  const userProperty = result.value;

  const resource: SavedUserPropertyResource = {
    id: userProperty.id,
    name: userProperty.name,
    workspaceId: userProperty.workspaceId,
    definition: userProperty.definition as UserPropertyDefinition,
    exampleValue: userProperty.exampleValue ?? undefined,
    updatedAt: userProperty.updatedAt.getTime(),
    createdAt: userProperty.createdAt.getTime(),
    definitionUpdatedAt: userProperty.definitionUpdatedAt.getTime(),
  };

  return ok(resource);
}

/**
 * Insert user property assignments into the computed_property_assignments table
 * for testing. Should never be used in production.
 *
 * @param rawAssignments - An array of raw assignments to insert.
 */
export async function insertUserPropertyAssignments(
  rawAssignments: UserPropertyBulkUpsertItem[],
) {
  const client = clickhouseClient();
  const assignments = rawAssignments.map((assignment) => ({
    workspace_id: assignment.workspaceId,
    type: "user_property",
    user_id: assignment.userId,
    computed_property_id: assignment.userPropertyId,
    user_property_value: assignment.value,
    segment_value: false,
  }));
  await client.insert({
    table: "computed_property_assignments_v2",
    values: assignments,
    format: "JSONEachRow",
    clickhouse_settings: { wait_end_of_query: 1 },
  });
}

export async function findUserIdsByUserPropertyValue({
  workspaceId,
  userPropertyName,
  value,
}: {
  workspaceId: string;
  userPropertyName: string;
  value: string;
}): Promise<string[] | null> {
  const userProperties = await db()
    .select()
    .from(dbUserProperty)
    .where(
      and(
        eq(dbUserProperty.workspaceId, workspaceId),
        eq(dbUserProperty.name, userPropertyName),
      ),
    );
  const [userProperty] = userProperties;
  if (!userProperty) {
    return null;
  }
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select
      user_id,
      argMax(user_property_value, assigned_at) as latest_user_property_value
    from computed_property_assignments_v2
    where
      workspace_id = ${qb.addQueryValue(workspaceId, "String")}
      and type = 'user_property'
      and computed_property_id = ${qb.addQueryValue(userProperty.id, "String")}
    group by user_id
    having latest_user_property_value = ${qb.addQueryValue(value, "String")}
  `;
  const result = await chQuery({
    query,
    query_params: qb.getQueries(),
    clickhouse_settings: {
      select_sequential_consistency: assignmentSequentialConsistency(),
    },
  });
  const rows = await result.json<{ user_id: string }>();
  return rows.map((row) => row.user_id);
}
