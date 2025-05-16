import { writeToString } from "@fast-csv/format";
import { Static, Type } from "@sinclair/typebox";
import { ValueError } from "@sinclair/typebox/errors";
import { format } from "date-fns";
import { and, eq, inArray, InferSelectModel, not, SQL } from "drizzle-orm";
import deepEqual from "fast-deep-equal";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import {
  schemaValidate,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { err, ok, Result } from "neverthrow";
import { PostgresError } from "pg-error-enum";
import { validate as validateUuid } from "uuid";

import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  query as chQuery,
} from "./clickhouse";
import { assignmentSequentialConsistency } from "./config";
import { db, TxQueryError, txQueryResult } from "./db";
import {
  segment as dbSegment,
  subscriptionGroup as dbSubscriptionGroup,
} from "./db/schema";
import { jsonValue } from "./jsonPath";
import logger from "./logger";
import {
  EnrichedSegment,
  InternalEventType,
  JsonResult,
  KeyedPerformedSegmentNode,
  KeyedSegmentEventContext,
  PartialSegmentResource,
  RelationalOperators,
  SavedSegmentResource,
  Segment,
  SegmentAssignment,
  SegmentDefinition,
  SegmentNode,
  SegmentNodeType,
  SegmentOperatorType,
  UpsertSegmentResource,
  UpsertSegmentValidationError,
  UpsertSegmentValidationErrorType,
  UserWorkflowTrackEvent,
} from "./types";
import { findAllUserPropertyAssignmentsForWorkspace } from "./userProperties";

export function enrichSegment(
  segment: InferSelectModel<typeof dbSegment>,
): Result<EnrichedSegment, Error> {
  const definitionResult = schemaValidateWithErr(
    segment.definition,
    SegmentDefinition,
  );
  if (definitionResult.isErr()) {
    return err(definitionResult.error);
  }
  return ok({
    ...segment,
    definition: definitionResult.value,
  });
}

export async function findAllSegmentAssignmentsByIds({
  workspaceId,
  segmentIds,
  userId,
}: {
  workspaceId: string;
  segmentIds: string[];
  userId: string;
}): Promise<{ segmentId: string; inSegment: boolean }[]> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const userIdParam = qb.addQueryValue(userId, "String");
  const query = `
    SELECT
      computed_property_id,
      argMax(segment_value, assigned_at) as latest_segment_value
    FROM computed_property_assignments_v2
    WHERE
      workspace_id = ${workspaceIdParam}
      AND type = 'segment'
      AND user_id = ${userIdParam}
      AND computed_property_id IN ${qb.addQueryValue(segmentIds, "Array(String)")}
    GROUP BY computed_property_id
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
    latest_segment_value: boolean;
  }>();
  return rows.map((row) => ({
    segmentId: row.computed_property_id,
    inSegment: row.latest_segment_value,
  }));
}

export async function findAllSegmentAssignments({
  workspaceId,
  userId,
  segmentIds,
}: {
  workspaceId: string;
  userId: string;
  segmentIds?: string[];
}): Promise<Record<string, boolean | null>> {
  const segments = await db().query.segment.findMany({
    where: eq(dbSegment.workspaceId, workspaceId),
  });
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const userIdParam = qb.addQueryValue(userId, "String");
  const segmentIdsClause = segmentIds
    ? `AND computed_property_id IN ${qb.addQueryValue(segmentIds, "Array(String)")}`
    : "";
  const query = `
    SELECT
      computed_property_id,
      argMax(segment_value, assigned_at) as latest_segment_value
    FROM computed_property_assignments_v2
    WHERE
      workspace_id = ${workspaceIdParam}
      AND type = 'segment'
      AND user_id = ${userIdParam}
      ${segmentIdsClause}
    GROUP BY computed_property_id
    HAVING latest_segment_value = true
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
    latest_segment_value: boolean;
  }>();
  const assignmentMap = new Map<string, boolean>();
  for (const row of rows) {
    assignmentMap.set(row.computed_property_id, row.latest_segment_value);
  }
  const segmentAssignment = segments.reduce<Record<string, boolean | null>>(
    (memo, curr) => {
      memo[curr.name] = assignmentMap.get(curr.id) ?? null;
      return memo;
    },
    {},
  );

  return segmentAssignment;
}

export async function createSegment({
  name,
  definition,
  workspaceId,
}: {
  name: string;
  workspaceId: string;
  definition: SegmentDefinition;
}) {
  await db().insert(dbSegment).values({
    workspaceId,
    name,
    definition,
  });
}

export function toSegmentResource(
  segment: Segment,
): Result<SavedSegmentResource, Error> {
  const result = enrichSegment(segment);
  if (result.isErr()) {
    return err(result.error);
  }
  const { id, name, workspaceId, definition, subscriptionGroupId } =
    result.value;
  return ok({
    id,
    name,
    workspaceId,
    definition,
    subscriptionGroupId: subscriptionGroupId ?? undefined,
    updatedAt: segment.updatedAt.getTime(),
    definitionUpdatedAt: segment.definitionUpdatedAt.getTime(),
    createdAt: segment.createdAt.getTime(),
    status: segment.status,
  });
}

export async function findEnrichedSegment(
  segmentId: string,
): Promise<Result<EnrichedSegment | null, Error>> {
  const segments = await db()
    .select()
    .from(dbSegment)
    .where(eq(dbSegment.id, segmentId));

  const segment = segments[0];
  if (!segment) {
    return ok(null);
  }

  return enrichSegment(segment);
}

export async function findEnrichedSegments({
  workspaceId,
  ids,
}: {
  workspaceId: string;
  ids?: string[];
}): Promise<Result<EnrichedSegment[], Error>> {
  const conditions: SQL[] = [eq(dbSegment.workspaceId, workspaceId)];
  if (ids && ids.length > 0) {
    conditions.push(inArray(dbSegment.id, ids));
  }
  const where = and(...conditions);
  const segments = await db().select().from(dbSegment).where(where);

  const enrichedSegments: EnrichedSegment[] = [];
  for (const segment of segments) {
    const definitionResult = schemaValidateWithErr(
      segment.definition,
      SegmentDefinition,
    );
    if (definitionResult.isErr()) {
      return err(definitionResult.error);
    }
    enrichedSegments.push({
      ...segment,
      definition: definitionResult.value,
    });
  }
  return ok(enrichedSegments);
}

export async function findSegmentResources({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<SavedSegmentResource[]> {
  const segments = await db()
    .select()
    .from(dbSegment)
    .where(
      and(
        eq(dbSegment.workspaceId, workspaceId),
        eq(dbSegment.status, "Running"),
        eq(dbSegment.resourceType, "Declarative"),
      ),
    );
  return segments.flatMap((segment) => {
    const result = toSegmentResource(segment);
    if (result.isErr()) {
      logger().error(
        {
          error: result.error,
          segment,
        },
        "Failed to convert segment to resource",
      );
      return [];
    }
    return result.value;
  });
}

export async function findManyEnrichedSegments({
  workspaceId,
  segmentIds,
  requireRunning = true,
}: {
  workspaceId: string;
  segmentIds?: string[];
  requireRunning?: boolean;
}): Promise<Result<EnrichedSegment[], ValueError[]>> {
  const conditions: SQL[] = [eq(dbSegment.workspaceId, workspaceId)];
  if (segmentIds && segmentIds.length > 0) {
    conditions.push(inArray(dbSegment.id, segmentIds));
  } else if (requireRunning) {
    conditions.push(eq(dbSegment.status, "Running"));
  }
  const segments = await db()
    .select()
    .from(dbSegment)
    .where(and(...conditions));

  const enrichedSegments: EnrichedSegment[] = [];
  for (const segment of segments) {
    const definitionResult = schemaValidate(
      segment.definition,
      SegmentDefinition,
    );
    if (definitionResult.isErr()) {
      return err(definitionResult.error);
    }
    enrichedSegments.push({
      ...segment,
      definition: definitionResult.value,
    });
  }
  return ok(enrichedSegments);
}

export async function findManySegmentResourcesSafe({
  workspaceId,
  segmentIds,
  requireRunning = true,
}: {
  workspaceId: string;
  segmentIds?: string[];
  requireRunning?: boolean;
}): Promise<Result<SavedSegmentResource, Error>[]> {
  const conditions: SQL[] = [eq(dbSegment.workspaceId, workspaceId)];
  if (segmentIds && segmentIds.length > 0) {
    conditions.push(inArray(dbSegment.id, segmentIds));
  } else if (requireRunning) {
    conditions.push(eq(dbSegment.status, "Running"));
  }
  const where = and(...conditions);
  const segments = await db().select().from(dbSegment).where(where);

  const results: Result<SavedSegmentResource, Error>[] = segments.map(
    (segment) => toSegmentResource(segment),
  );
  return results;
}

/**
 * Upsert segment resource if the existing segment is not internal.
 * @param segment
 * @returns
 */
export async function upsertSegment(
  params: UpsertSegmentResource,
): Promise<Result<SavedSegmentResource, UpsertSegmentValidationError>> {
  if (params.id && !validateUuid(params.id)) {
    return err({
      type: UpsertSegmentValidationErrorType.IdError,
      message: "Invalid segment id, must be a valid v4 UUID",
    });
  }

  const value: typeof dbSegment.$inferInsert = {
    id: params.id,
    workspaceId: params.workspaceId,
    name: params.name,
    definition: params.definition,
    resourceType: params.resourceType,
    status: params.status,
  };

  const txResult: Result<Segment, TxQueryError> = await db().transaction(
    async (tx) => {
      const findFirstConditions: SQL[] = [
        eq(dbSegment.workspaceId, params.workspaceId),
      ];
      if (params.id) {
        findFirstConditions.push(eq(dbSegment.id, params.id));
      } else {
        findFirstConditions.push(eq(dbSegment.name, params.name));
      }
      const existingSegment = await tx.query.segment.findFirst({
        where: and(...findFirstConditions),
      });
      if (existingSegment) {
        if (params.createOnly) {
          return ok(existingSegment);
        }
        const wasDefinitionUpdated =
          params.definition &&
          !deepEqual(existingSegment.definition, params.definition);

        const updateResult = await txQueryResult(
          tx
            .update(dbSegment)
            .set({
              definition: params.definition,
              name: params.name,
              resourceType: params.resourceType,
              definitionUpdatedAt: wasDefinitionUpdated
                ? new Date()
                : existingSegment.definitionUpdatedAt,
            })
            .where(eq(dbSegment.id, existingSegment.id))
            .returning(),
        );
        if (updateResult.isErr()) {
          return err(updateResult.error);
        }
        const updatedSegment = updateResult.value[0];
        if (!updatedSegment) {
          logger().error(
            {
              workspaceId: params.workspaceId,
              segmentId: existingSegment.id,
            },
            "segment not found",
          );
          throw new Error("segment not found");
        }
        return ok(updatedSegment);
      }
      // FIXME don't update manual version
      // FIXME don't update lastUpdatedAt
      // FIXME manual segments should not be not started
      const createResult = await txQueryResult(
        tx.insert(dbSegment).values(value).returning(),
      );
      if (createResult.isErr()) {
        return err(createResult.error);
      }
      const createdSegment = createResult.value[0];
      if (!createdSegment) {
        logger().error(
          {
            workspaceId: params.workspaceId,
            name: params.name,
          },
          "segment not found",
        );
        throw new Error("segment not found");
      }
      return ok(createdSegment);
    },
  );
  if (txResult.isErr()) {
    if (
      txResult.error.code === PostgresError.FOREIGN_KEY_VIOLATION ||
      txResult.error.code === PostgresError.UNIQUE_VIOLATION
    ) {
      return err({
        type: UpsertSegmentValidationErrorType.UniqueConstraintViolation,
        message:
          "Names must be unique in workspace. Id's must be globally unique.",
      });
    }
    logger().error(
      {
        err: txResult.error,
        params,
      },
      "Failed to upsert segment",
    );
    throw txResult.error;
  }
  const segment = txResult.value;

  return ok({
    id: segment.id,
    workspaceId: segment.workspaceId,
    name: segment.name,
    definition: segment.definition as SegmentDefinition,
    definitionUpdatedAt: segment.definitionUpdatedAt.getTime(),
    updatedAt: segment.updatedAt.getTime(),
    createdAt: segment.createdAt.getTime(),
    resourceType: segment.resourceType,
  });
}

export function segmentNodeIsBroadcast(node: SegmentNode): boolean {
  return (
    node.type === SegmentNodeType.Broadcast ||
    (node.type === SegmentNodeType.Performed &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      node.event === InternalEventType.SegmentBroadcast)
  );
}

export function segmentHasBroadcast(definition: SegmentDefinition): boolean {
  if (segmentNodeIsBroadcast(definition.entryNode)) {
    return true;
  }

  for (const node of definition.nodes) {
    if (segmentNodeIsBroadcast(node)) {
      return true;
    }
  }
  return false;
}

const downloadCsvHeaders = [
  "segmentName",
  "segmentId",
  "userId",
  "inSegment",
  "subscriptionGroupName",
];

async function getWorkspaceSegmentAssignments({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const query = `
    SELECT
      computed_property_id,
      user_id,
      argMax(segment_value, assigned_at) as latest_segment_value
    FROM computed_property_assignments_v2
    WHERE
      workspace_id = ${workspaceIdParam}
      AND type = 'segment'
    GROUP BY computed_property_id, user_id
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
    latest_segment_value: boolean;
    user_id: string;
  }>();
  return rows.map((row) => ({
    segmentId: row.computed_property_id,
    inSegment: row.latest_segment_value,
    userId: row.user_id,
  }));
}

// TODO use pagination, and blob store
export async function buildSegmentsFile({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<{
  fileName: string;
  fileContent: string;
}> {
  const identifiers = Object.values(CHANNEL_IDENTIFIERS);
  const [segments, userIdentifiers, segmentAssignments] = await Promise.all([
    db()
      .select()
      .from(dbSegment)
      .where(eq(dbSegment.workspaceId, workspaceId))
      .leftJoin(
        dbSubscriptionGroup,
        eq(dbSegment.subscriptionGroupId, dbSubscriptionGroup.id),
      ),
    findAllUserPropertyAssignmentsForWorkspace({
      workspaceId,
    }),
    getWorkspaceSegmentAssignments({ workspaceId }),
  ]);
  const segmentMap = new Map<string, (typeof segments)[number]>();
  for (const segment of segments) {
    segmentMap.set(segment.Segment.id, segment);
  }

  const assignments: Record<string, string>[] = segmentAssignments.flatMap(
    (a) => {
      const segment = segmentMap.get(a.segmentId);
      if (!segment) {
        logger().error(
          {
            workspaceId,
            segmentId: a.segmentId,
          },
          "segment not found for build segment file",
        );
        return [];
      }
      const csvAssignment: Record<string, string> = {
        segmentName: segment.Segment.name,
        subscriptionGroupName: segment.SubscriptionGroup?.name ?? "",
        segmentId: a.segmentId,
        userId: a.userId,
        inSegment: a.inSegment.toString(),
      };
      const ui = userIdentifiers[a.userId];
      if (ui) {
        for (const key in ui) {
          const value = ui[key];

          if (typeof value === "string" && value.length > 0) {
            csvAssignment[key] = value;
          }
        }
      }
      return [csvAssignment];
    },
  );
  const fileContent = await writeToString(assignments, {
    headers: [...downloadCsvHeaders, ...identifiers],
  });

  const formattedDate = format(new Date(), "yyyy-MM-dd");
  const fileName = `segment-assignments-${formattedDate}.csv`;

  return {
    fileName,
    fileContent,
  };
}

export type SegmentBulkUpsertItem = Pick<
  SegmentAssignment,
  "workspaceId" | "userId" | "segmentId" | "inSegment"
>;

export function getSegmentNode(
  definition: SegmentDefinition,
  id: string,
): SegmentNode | null {
  if (definition.entryNode.id === id) {
    return definition.entryNode;
  }
  return definition.nodes.find((node) => node.id === id) ?? null;
}

export async function findManyPartialSegments({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<PartialSegmentResource[]> {
  const segments = await db().query.segment.findMany({
    where: and(
      eq(dbSegment.workspaceId, workspaceId),
      not(eq(dbSegment.resourceType, "Internal")),
    ),
  });
  return segments.flatMap((segment) => {
    const {
      id,
      name,
      subscriptionGroupId,
      updatedAt,
      definitionUpdatedAt,
      createdAt,
      resourceType,
    } = segment;
    return {
      id,
      name,
      workspaceId,
      subscriptionGroupId: subscriptionGroupId ?? undefined,
      updatedAt: updatedAt.getTime(),
      definitionUpdatedAt: definitionUpdatedAt.getTime(),
      createdAt: createdAt.getTime(),
      resourceType,
    } satisfies PartialSegmentResource;
  });
}

export enum CalculateKeyedSegmentsErrorType {
  InvalidDefinition = "InvalidDefinition",
}

export const CalculateKeyedSegmentsError = Type.Object({
  type: Type.Enum(CalculateKeyedSegmentsErrorType),
});

export type CalculateKeyedSegmentsError = Static<
  typeof CalculateKeyedSegmentsError
>;

export const CalculateKeyedSegmentsResult = JsonResult(
  Type.Boolean(),
  CalculateKeyedSegmentsError,
);

export type CalculateKeyedSegmentsResult = Static<
  typeof CalculateKeyedSegmentsResult
>;

function filterEvent(
  {
    event,
    properties,
    ...rest
  }: Pick<KeyedPerformedSegmentNode, "event" | "properties"> & {
    propertyPath: string;
    propertyValue: string;
  },
  e: UserWorkflowTrackEvent,
): boolean {
  if (e.event !== event) {
    logger().debug(
      {
        event,
        actualEvent: e.event,
        messageId: e.messageId,
      },
      "event name does not match",
    );
    return false;
  }
  if ("messageId" in rest) {
    logger().debug(
      {
        messageId: e.messageId,
        expectedMessageId: rest.messageId,
      },
      "message id does not match",
    );
    if (e.messageId !== rest.messageId) {
      return false;
    }
  }
  if ("propertyPath" in rest) {
    const propertyMatchResult = jsonValue({
      data: e.properties,
      path: rest.propertyPath,
    });
    const propertyMatches = propertyMatchResult
      .map((v) => v === rest.propertyValue)
      .unwrapOr(false);
    if (!propertyMatches) {
      logger().debug(
        {
          propertyPath: rest.propertyPath,
          propertyValue: rest.propertyValue,
          actualPropertyValue: propertyMatchResult.unwrapOr(null),
        },
        "property path does not match",
      );
      return false;
    }
  }
  for (const property of properties ?? []) {
    const { path, operator } = property;
    const value = jsonValue({
      data: e.properties,
      path,
    }).unwrapOr(null);

    let mismatched = false;
    switch (operator.type) {
      case SegmentOperatorType.Equals: {
        mismatched = value !== operator.value;
        break;
      }
      case SegmentOperatorType.Exists: {
        mismatched = value === null || value === "" || value === undefined;
        break;
      }
      case SegmentOperatorType.LessThan: {
        const numValue = Number(value);
        mismatched = Number.isNaN(numValue) || numValue >= operator.value;
        break;
      }
      case SegmentOperatorType.GreaterThanOrEqual: {
        const numValue = Number(value);
        mismatched = Number.isNaN(numValue) || numValue < operator.value;
        break;
      }
      default:
        logger().error(
          {
            operator,
          },
          "unsupported operator",
        );
        return false;
    }

    if (mismatched) {
      logger().debug(
        {
          path,
          value,
          operator,
        },
        "property value does not match",
      );
      return false;
    }
  }
  return true;
}

export function calculateKeyedSegment({
  events: unfilteredEvents,
  keyValue,
  definition,
}: KeyedSegmentEventContext): boolean {
  const entryNode = definition;
  const { times: maybeTimes, timesOperator: maybeTimesOperator } = entryNode;
  let eventsCount = 0;
  for (const e of unfilteredEvents) {
    if (
      filterEvent(
        {
          event: entryNode.event,
          properties: definition.properties,
          propertyPath: definition.key,
          propertyValue: keyValue,
        },
        e,
      )
    ) {
      eventsCount += 1;
    }
  }
  logger().debug(
    {
      unfilteredEvents,
      eventsCount,
    },
    "events for calculate keyed segment",
  );
  const times = maybeTimes ?? 1;
  const timesOperator =
    maybeTimesOperator ?? RelationalOperators.GreaterThanOrEqual;

  let result: boolean;
  switch (timesOperator) {
    case RelationalOperators.GreaterThanOrEqual:
      result = eventsCount >= times;
      break;
    case RelationalOperators.LessThan:
      result = eventsCount < times;
      break;
    case RelationalOperators.Equals:
      result = eventsCount === times;
      break;
    default:
      assertUnreachable(timesOperator);
  }
  return result;
}

export async function findRecentlyUpdatedUsersInSegment({
  workspaceId,
  cursor,
  assignedSince,
  segmentId,
  pageSize,
}: {
  workspaceId: string;
  segmentId: string;
  cursor?: string;
  assignedSince: number;
  pageSize: number;
}): Promise<{ userId: string }[]> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const segmentIdParam = qb.addQueryValue(segmentId, "String");
  const paginationClause = !cursor
    ? ""
    : `AND user_id > ${qb.addQueryValue(cursor, "String")}`;

  const query = `
    SELECT user_id as "userId" FROM computed_property_assignments_v2
    WHERE
      workspace_id = ${workspaceIdParam}
      AND type = 'segment'
      AND computed_property_id = ${segmentIdParam}
      AND assigned_at > toDateTime64(${assignedSince / 1000}, 3)
      AND segment_value = true
      ${paginationClause}
    LIMIT ${pageSize}
  `;
  const result = await chQuery({
    query,
    query_params: qb.getQueries(),
    clickhouse_settings: {
      select_sequential_consistency: assignmentSequentialConsistency(),
    },
  });
  const rows = await result.json<{ userId: string }>();
  return rows;
}

export async function insertSegmentAssignments(
  rawAssignments: SegmentBulkUpsertItem[],
) {
  const client = clickhouseClient();
  const assignments = rawAssignments.map((assignment) => ({
    workspace_id: assignment.workspaceId,
    type: "segment",
    user_id: assignment.userId,
    computed_property_id: assignment.segmentId,
    segment_value: assignment.inSegment,
  }));
  await client.insert({
    table: "computed_property_assignments_v2",
    values: assignments,
    format: "JSONEachRow",
    clickhouse_settings: { wait_end_of_query: 1 },
  });
}

export async function getSegmentAssignmentDb({
  workspaceId,
  segmentId,
  userId,
}: {
  workspaceId: string;
  segmentId: string;
  userId: string;
}): Promise<boolean | null> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const segmentIdParam = qb.addQueryValue(segmentId, "String");
  const userIdParam = qb.addQueryValue(userId, "String");
  const query = `
    SELECT
      argMax(segment_value, assigned_at) as latest_segment_value
    FROM computed_property_assignments_v2
    WHERE
      workspace_id = ${workspaceIdParam}
      AND type = 'segment'
      AND computed_property_id = ${segmentIdParam}
      AND user_id = ${userIdParam}
    GROUP BY computed_property_id, user_id
  `;
  const result = await chQuery({
    query,
    query_params: qb.getQueries(),
    clickhouse_settings: {
      select_sequential_consistency: assignmentSequentialConsistency(),
    },
  });
  const rows = await result.json<{ latest_segment_value: boolean }>();
  return rows[0]?.latest_segment_value ?? null;
}
