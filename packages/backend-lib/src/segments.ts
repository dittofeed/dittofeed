import { writeToString } from "@fast-csv/format";
import { Static, Type } from "@sinclair/typebox";
import { ValueError } from "@sinclair/typebox/errors";
import { format } from "date-fns";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import {
  schemaValidate,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { err, ok, Result } from "neverthrow";

import { jsonValue } from "./jsonPath";
import logger from "./logger";
import prisma from "./prisma";
import {
  EnrichedSegment,
  InternalEventType,
  JsonResult,
  JsonResultType,
  KeyedSegmentEventContext,
  PartialSegmentResource,
  PerformedSegmentNode,
  Prisma,
  RelationalOperators,
  SavedSegmentResource,
  Segment,
  SegmentAssignment,
  SegmentDefinition,
  SegmentNode,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentResource,
  UpsertSegmentResource,
  UserWorkflowTrackEvent,
} from "./types";

export function enrichSegment(
  segment: Segment,
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

export async function findAllSegmentAssignments({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<Record<string, boolean | null>> {
  const segments = await prisma().segment.findMany({
    where: {
      workspaceId,
    },
    include: {
      SegmentAssignment: {
        where: {
          userId,
        },
      },
    },
  });

  const segmentAssignment = segments.reduce<Record<string, boolean | null>>(
    (memo, curr) => {
      memo[curr.name] = curr.SegmentAssignment[0]?.inSegment ?? null;
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
  await prisma().segment.create({
    data: {
      workspaceId,
      name,
      definition,
    },
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
  });
}

export async function findEnrichedSegment(
  segmentId: string,
): Promise<Result<EnrichedSegment | null, Error>> {
  const segment = await prisma().segment.findFirst({
    where: { id: segmentId },
  });
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
  const where: Prisma.SegmentWhereInput = {
    workspaceId,
  };
  if (ids) {
    where.id = {
      in: ids,
    };
  }
  const segments = await prisma().segment.findMany({
    where,
  });

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
}): Promise<SegmentResource[]> {
  const segments = await prisma().segment.findMany({
    where: {
      workspaceId,
      status: "Running",
      resourceType: "Declarative",
    },
  });
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
  const segments = await prisma().segment.findMany({
    where: {
      workspaceId,
      ...(segmentIds?.length
        ? {
            id: {
              in: segmentIds,
            },
          }
        : null),
      ...(requireRunning && !segmentIds?.length
        ? {
            status: "Running",
          }
        : null),
    },
  });

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
  const segments = await prisma().segment.findMany({
    where: {
      workspaceId,
      ...(segmentIds?.length
        ? {
            id: {
              in: segmentIds,
            },
          }
        : null),
      ...(requireRunning && !segmentIds?.length
        ? {
            status: "Running",
          }
        : null),
    },
  });
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
  segment: UpsertSegmentResource,
): Promise<SavedSegmentResource> {
  const { id, workspaceId, name, definition } = segment;
  const query = Prisma.sql`
    INSERT INTO "Segment" ("id", "workspaceId", "name", "definition", "updatedAt")
    VALUES (${id}::uuid, ${workspaceId}::uuid, ${name}, ${definition}::jsonb, NOW())
    ON CONFLICT ("id")
    DO UPDATE SET
        "workspaceId" = excluded."workspaceId",
        "name" = COALESCE(excluded."name", "Segment"."name"),
        "definition" = COALESCE(excluded."definition", "Segment"."definition"),
        "updatedAt" = NOW(),
        "definitionUpdatedAt" = CASE WHEN excluded."definition" != "Segment"."definition" THEN NOW() ELSE "Segment"."definitionUpdatedAt" END
    RETURNING *`;
  const [result] = (await prisma().$queryRaw(query)) as [Segment];
  const updatedDefinition = result.definition as SegmentDefinition;

  return {
    id: result.id,
    workspaceId: result.workspaceId,
    name: result.name,
    definition: updatedDefinition,
    definitionUpdatedAt: result.definitionUpdatedAt.getTime(),
    updatedAt: Number(result.updatedAt),
    createdAt: Number(result.createdAt),
  };
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
  const [dbSegmentAssignments, userIdentifiers] = await Promise.all([
    prisma().segmentAssignment.findMany({
      where: { workspaceId },
      include: {
        segment: {
          select: {
            name: true,
            subscriptionGroup: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma().userPropertyAssignment.findMany({
      where: {
        workspaceId,
        userProperty: {
          name: {
            in: identifiers,
          },
        },
      },
      select: {
        userProperty: {
          select: {
            name: true,
          },
        },
        userId: true,
        value: true,
      },
    }),
  ]);
  const userIdentifiersMap = userIdentifiers.reduce((acc, curr) => {
    const userPropertyName = curr.userProperty.name;
    const ui = acc.get(curr.userId) ?? new Map<string, string>();
    ui.set(userPropertyName, curr.value);
    acc.set(curr.userId, ui);
    return acc;
  }, new Map<string, Map<string, string>>());

  const assignments: Record<string, string>[] = dbSegmentAssignments.map(
    (a) => {
      const csvAssignment: Record<string, string> = {
        segmentName: a.segment.name,
        subscriptionGroupName: a.segment.subscriptionGroup?.name ?? "",
        segmentId: a.segmentId,
        userId: a.userId,
        inSegment: a.inSegment.toString(),
      };
      const ui = userIdentifiersMap.get(a.userId);
      ui?.forEach((value, key) => {
        const parsed = JSON.parse(value) as unknown;
        if (typeof parsed === "string" && parsed.length > 0) {
          csvAssignment[key] = parsed;
        }
      });
      return csvAssignment;
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

export async function upsertBulkSegmentAssignments({
  data,
}: {
  data: SegmentBulkUpsertItem[];
}) {
  if (data.length === 0) {
    return;
  }
  const existing = new Map<string, SegmentBulkUpsertItem>();
  for (const item of data) {
    const key = `${item.workspaceId}-${item.segmentId}-${item.userId}`;
    if (existing.has(key)) {
      logger().warn(
        {
          existing: existing.get(key),
          new: item,
          workspaceId: item.workspaceId,
        },
        "duplicate segment assignment in bulk upsert",
      );
      continue;
    }
    existing.set(key, item);
  }
  const deduped = Array.from(existing.values());
  const workspaceIds: Prisma.Sql[] = [];
  const userIds: string[] = [];
  const segmentIds: Prisma.Sql[] = [];
  const inSegment: boolean[] = [];

  for (const item of deduped) {
    workspaceIds.push(Prisma.sql`CAST(${item.workspaceId} AS UUID)`);
    userIds.push(item.userId);
    segmentIds.push(Prisma.sql`CAST(${item.segmentId} AS UUID)`);
    inSegment.push(item.inSegment);
  }

  const joinedSegmentIds = Prisma.join(segmentIds);

  const query = Prisma.sql`
    WITH unnested_values AS (
        SELECT
            unnest(array[${Prisma.join(workspaceIds)}]) AS "workspaceId",
            unnest(array[${Prisma.join(userIds)}]) as "userId",
            unnest(array[${joinedSegmentIds}]) AS "segmentId",
            unnest(array[${Prisma.join(inSegment)}]) AS "inSegment"
    )
    INSERT INTO "SegmentAssignment" ("workspaceId", "userId", "segmentId", "inSegment")
    SELECT
        u."workspaceId",
        u."userId",
        u."segmentId",
        u."inSegment"
    FROM unnested_values u
    WHERE EXISTS (
        SELECT 1
        FROM "Segment" s
        WHERE s.id = u."segmentId"
    )
    ON CONFLICT ("workspaceId", "userId", "segmentId")
    DO UPDATE SET
        "inSegment" = EXCLUDED."inSegment"
  `;

  try {
    await prisma().$executeRaw(query);
  } catch (e) {
    if (
      !(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003")
    ) {
      throw e;
    } else {
      logger().debug("P2003 error", e);
    }
  }
}

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
  const segments = await prisma().segment.findMany({
    where: {
      workspaceId,
      resourceType: {
        not: "Internal",
      },
    },
  });
  return segments.flatMap((segment) => {
    const {
      id,
      name,
      subscriptionGroupId,
      updatedAt,
      definitionUpdatedAt,
      createdAt,
    } = segment;
    return {
      id,
      name,
      workspaceId,
      subscriptionGroupId: subscriptionGroupId ?? undefined,
      updatedAt: updatedAt.getTime(),
      definitionUpdatedAt: definitionUpdatedAt.getTime(),
      createdAt: createdAt.getTime(),
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
    nowMs,
    event,
    withinSeconds,
    properties,
    ...rest
  }: {
    nowMs: number;
  } & Pick<PerformedSegmentNode, "withinSeconds" | "event" | "properties"> &
    (
      | {
          messageId: string;
        }
      | {
          propertyPath: string;
          propertyValue: string;
        }
    ),
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
  if (withinSeconds) {
    if (!e.timestamp) {
      logger().error(
        {
          messageId: e.messageId,
        },
        "event has no timestamp",
      );
      return false;
    }

    if (withinSeconds * 1000 < nowMs - new Date(e.timestamp).getTime()) {
      return false;
    }
  }
  return true;
}

export function calculateKeyedSegment({
  events: unfilteredEvents,
  keyValue,
  definition,
  nowMs,
}: KeyedSegmentEventContext): CalculateKeyedSegmentsResult {
  const entryNode = definition;
  let events: UserWorkflowTrackEvent[];
  const { times: maybeTimes, timesOperator: maybeTimesOperator } = entryNode;
  const withinSeconds =
    definition.type === SegmentNodeType.Performed
      ? definition.withinSeconds
      : undefined;

  // If key is undefined, assume keyValue is the messageId
  if (!("key" in entryNode)) {
    events = unfilteredEvents.filter((e) =>
      filterEvent(
        {
          nowMs,
          withinSeconds,
          event: entryNode.event,
          messageId: keyValue,
          properties: definition.properties,
        },
        e,
      ),
    );
    // If key is defined, assume keyValue corresponds to property value
  } else {
    const { key, event } = entryNode;
    events = unfilteredEvents.filter((e) =>
      filterEvent(
        {
          nowMs,
          withinSeconds,
          event,
          propertyPath: key,
          propertyValue: keyValue,
          properties: definition.properties,
        },
        e,
      ),
    );
  }
  logger().debug(
    {
      events,
      unfilteredEvents,
    },
    "events for calculate keyed segment",
  );
  const times = maybeTimes ?? 1;
  const timesOperator =
    maybeTimesOperator ?? RelationalOperators.GreaterThanOrEqual;
  const count = events.length;

  let result: boolean;
  switch (timesOperator) {
    case RelationalOperators.GreaterThanOrEqual:
      result = count >= times;
      break;
    case RelationalOperators.LessThan:
      result = count < times;
      break;
    case RelationalOperators.Equals:
      result = count === times;
      break;
    default:
      assertUnreachable(timesOperator);
  }
  return {
    type: JsonResultType.Ok,
    value: result,
  };
}
