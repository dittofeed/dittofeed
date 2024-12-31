import { Row } from "@clickhouse/client";
import { Prisma, PrismaClient } from "@prisma/client";
import { Type } from "@sinclair/typebox";
import { MESSAGE_EVENTS } from "isomorphic-lib/src/constants";
import {
  buildHeritageMap,
  getJourneyConstraintViolations,
  HeritageMap,
} from "isomorphic-lib/src/journeys";
import { parseInt, round } from "isomorphic-lib/src/numbers";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  schemaValidate,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { err, ok, Result } from "neverthrow";
import NodeCache from "node-cache";
import { validate as validateUuid } from "uuid";

import {
  ClickHouseQueryBuilder,
  query as chQuery,
  streamClickhouseQuery,
} from "./clickhouse";
import {
  startKeyedUserJourney,
  StartKeyedUserJourneyProps,
} from "./journeys/userWorkflow/lifecycle";
import logger from "./logger";
import prisma from "./prisma";
import { restartUserJourneyWorkflow } from "./restartUserJourneyWorkflow/lifecycle";
import {
  BaseMessageNodeStats,
  ChannelType,
  EmailStats,
  EnrichedJourney,
  InternalEventType,
  Journey,
  JourneyDefinition,
  JourneyDraft,
  JourneyNodeType,
  JourneyStats,
  JourneyStatus,
  JourneyUpsertValidationError,
  JourneyUpsertValidationErrorType,
  MessageChannelStats,
  NodeStatsType,
  SavedJourneyResource,
  SmsStats,
  UpsertJourneyResource,
} from "./types";

export * from "isomorphic-lib/src/journeys";

export function enrichJourney(
  journey: Journey,
): Result<EnrichedJourney, Error> {
  let definition: JourneyDefinition | undefined;
  if (journey.definition) {
    const definitionResult = schemaValidateWithErr(
      journey.definition,
      JourneyDefinition,
    );
    if (definitionResult.isErr()) {
      return err(definitionResult.error);
    }
    definition = definitionResult.value;
  }
  let draft: JourneyDraft | undefined;
  if (journey.draft) {
    const draftResult = schemaValidateWithErr(journey.draft, JourneyDraft);
    if (draftResult.isErr()) {
      return err(draftResult.error);
    }
    draft = draftResult.value;
  }
  return ok({
    ...journey,
    draft,
    definition,
  });
}

type FindManyParams = Parameters<PrismaClient["journey"]["findMany"]>[0];

export async function findManyJourneys(
  params: FindManyParams,
): Promise<Result<EnrichedJourney[], Error>> {
  const journeys = await prisma().journey.findMany(params);

  const subscribedJourneys: EnrichedJourney[] = [];

  for (const journey of journeys) {
    const enrichedJourney = enrichJourney(journey);

    if (enrichedJourney.isErr()) {
      return err(enrichedJourney.error);
    }

    subscribedJourneys.push(enrichedJourney.value);
  }

  return ok(subscribedJourneys);
}

export function toJourneyResource(
  journey: Journey,
): Result<SavedJourneyResource, Error> {
  const result = enrichJourney(journey);
  if (result.isErr()) {
    return err(result.error);
  }
  const { definition, draft, status, createdAt, updatedAt, ...rest } =
    result.value;
  const baseResource = {
    ...rest,
    ...(definition ? { definition } : {}),
    ...(draft ? { draft } : {}),
    createdAt: new Date(createdAt).getTime(),
    updatedAt: new Date(updatedAt).getTime(),
    status,
  };
  if (status === JourneyStatus.NotStarted) {
    return ok({
      ...baseResource,
      status,
    });
  }
  if (!definition) {
    return err(
      new Error(
        `journey definition is missing for journey with status ${status}`,
      ),
    );
  }

  return ok({
    ...baseResource,
    definition,
  });
}

export async function findManyJourneyResourcesSafe(
  params: FindManyParams,
): Promise<Result<SavedJourneyResource, Error>[]> {
  const journeys = await prisma().journey.findMany(params);
  const results: Result<SavedJourneyResource, Error>[] = journeys.map(
    (journey) => toJourneyResource(journey),
  );
  return results;
}

export async function findManyJourneyResourcesUnsafe(
  params: FindManyParams,
): Promise<SavedJourneyResource[]> {
  const journeys = await prisma().journey.findMany(params);
  const results = journeys.map((journey) => unwrap(toJourneyResource(journey)));
  return results;
}

// TODO don't use this method for activities. Don't want to retry failures typically.
export async function findManyJourneysUnsafe(
  params: FindManyParams,
): Promise<EnrichedJourney[]> {
  const result = await findManyJourneys(params);
  return unwrap(result);
}

const JourneyMessageStatsRow = Type.Object({
  journey_id: Type.String(),
  node_id: Type.String(),
  count: Type.String(),
});

interface GetEdgePercentParams {
  originId: string;
  targetId: string;
  heritageMap: HeritageMap;
  nodeProcessedMap: Map<string, number>;
}

function getEdgePercentRaw({
  originId,
  targetId,
  heritageMap,
  nodeProcessedMap,
}: GetEdgePercentParams): number | null {
  const originMapEntry = heritageMap.get(originId);
  if (!originMapEntry) {
    return null;
  }
  if (!originMapEntry.children.has(targetId)) {
    logger().debug(
      {
        children: Array.from(originMapEntry.children),
        targetId,
        originId,
      },
      "targetId not in originId children",
    );
    return null;
  }

  const originCount = nodeProcessedMap.get(originId);
  const targetCount = nodeProcessedMap.get(targetId);
  // TODO [DF-467] handle the case of targetId is an exit node
  if (
    originCount === undefined ||
    originCount === 0 ||
    targetCount === undefined ||
    targetCount === 0
  ) {
    logger().debug(
      {
        originCount,
        targetCount,
        originId,
        targetId,
      },
      "either the origin or target have no processed nodes, returning 0 edge percent",
    );
    return null;
  }

  if (originMapEntry.children.size === 1) {
    return 1;
  }

  const targetMapEntry = heritageMap.get(targetId);
  if (!targetMapEntry) {
    return null;
  }
  if (targetMapEntry.parents.size === 1) {
    return targetCount / originCount;
  }

  // when the target has multiple parents, we need to calculate the siblings
  // count in order to handle the case of a re-joined e.g segment-split
  let siblingsCount = 0;
  for (const childId of originMapEntry.children) {
    if (childId === targetId) {
      continue;
    }
    const siblingCount = nodeProcessedMap.get(childId);
    if (siblingCount === undefined) {
      continue;
    }
    siblingsCount += siblingCount;
  }

  return (originCount - siblingsCount) / originCount;
}

function getEdgePercent(params: GetEdgePercentParams): number | null {
  const raw = getEdgePercentRaw(params);
  if (raw === null) {
    return null;
  }
  return round(raw * 100, 1);
}

interface JourneyMessageStats {
  journeyId: string;
  nodeId: string;
  stats: BaseMessageNodeStats;
}

export async function getJourneyMessageStats({
  workspaceId,
  journeys,
}: {
  workspaceId: string;
  journeys: {
    id: string;
    nodes: {
      id: string;
      channel: ChannelType;
    }[];
  }[];
}): Promise<JourneyMessageStats[]> {
  if (!journeys.length) {
    return [];
  }
  const journeyIds = journeys.map((j) => j.id);
  const messageStats: JourneyMessageStats[] = [];
  const qb = new ClickHouseQueryBuilder();

  const query = `
    SELECT
        journey_id,
        last_event as event,
        node_id,
        count(resolved_message_id) AS count
    FROM (
            SELECT
                JSON_VALUE(message_raw, '$.properties.journeyId') AS journey_id,
                JSON_VALUE(message_raw, '$.properties.nodeId') AS node_id,
                JSON_VALUE(message_raw, '$.properties.runId') AS run_id,
                if(
                    (
                        JSON_VALUE(message_raw, '$.properties.messageId') AS property_message_id
                    ) != '',
                    property_message_id,
                    message_id
                ) AS resolved_message_id,
                argMax(event, event_time) as last_event
            FROM user_events_v2
            WHERE
                workspace_id = ${qb.addQueryValue(workspaceId, "String")}
                AND journey_id in ${qb.addQueryValue(
                  journeyIds,
                  "Array(String)",
                )}
                AND (event_type = 'track')
                AND (event in ${qb.addQueryValue(
                  MESSAGE_EVENTS,
                  "Array(String)",
                )})
            GROUP BY
                journey_id,
                node_id,
                run_id,
                resolved_message_id
        )
    GROUP BY
        journey_id,
        node_id,
        event
  `;
  const resultsSet = await chQuery({
    query,
    query_params: qb.getQueries(),
    format: "JSONEachRow",
  });
  const statsMap = new Map<string, Map<string, Map<string, number>>>();
  await streamClickhouseQuery(resultsSet, (row) => {
    for (const i of row) {
      const item = i as {
        journey_id: string;
        // represents the last observed event for a given email
        // so for example a clicked email will also have been opened and
        // delivered
        event: string;
        node_id: string;
        count: string;
      };
      const journeyStats =
        statsMap.get(item.journey_id) ?? new Map<string, Map<string, number>>();
      const nodeStats =
        journeyStats.get(item.node_id) ?? new Map<string, number>();

      nodeStats.set(item.event, parseInt(item.count));
      journeyStats.set(item.node_id, nodeStats);
      statsMap.set(item.journey_id, journeyStats);
    }
  });

  for (const journey of journeys) {
    const journeyStats = statsMap.get(journey.id);
    if (!journeyStats) {
      continue;
    }
    for (const node of journey.nodes) {
      const nodeStats = journeyStats.get(node.id);
      if (!nodeStats) {
        continue;
      }

      let channelStats: MessageChannelStats | null = null;
      const total = Array.from(nodeStats.values()).reduce(
        (acc, val) => acc + val,
        0,
      );
      const failed =
        (nodeStats.get(InternalEventType.MessageFailure) ?? 0) +
        (nodeStats.get(InternalEventType.BadWorkspaceConfiguration) ?? 0);
      const sent = total - failed;
      const sendRate = sent / total;

      switch (node.channel) {
        case ChannelType.Email: {
          const delivered =
            (nodeStats.get(InternalEventType.EmailDelivered) ?? 0) +
            (nodeStats.get(InternalEventType.EmailOpened) ?? 0) +
            (nodeStats.get(InternalEventType.EmailClicked) ?? 0) +
            (nodeStats.get(InternalEventType.EmailMarkedSpam) ?? 0);

          const clicked = nodeStats.get(InternalEventType.EmailClicked) ?? 0;
          const spam = nodeStats.get(InternalEventType.EmailMarkedSpam) ?? 0;
          const opened =
            (nodeStats.get(InternalEventType.EmailOpened) ?? 0) +
            (nodeStats.get(InternalEventType.EmailMarkedSpam) ?? 0) +
            (nodeStats.get(InternalEventType.EmailClicked) ?? 0);

          const emailStats: EmailStats = {
            type: ChannelType.Email,
            deliveryRate: delivered / total,
            openRate: opened / total,
            spamRate: spam / total,
            clickRate: clicked / total,
          };
          channelStats = emailStats;
          break;
        }
        case ChannelType.Sms: {
          const delivered = nodeStats.get(InternalEventType.SmsDelivered) ?? 0;
          const smsFailures = nodeStats.get(InternalEventType.SmsFailed) ?? 0;
          const smsStats: SmsStats = {
            type: ChannelType.Sms,
            deliveryRate: delivered / total,
            failRate: smsFailures / total,
          };
          channelStats = smsStats;
          break;
        }
        case ChannelType.MobilePush: {
          continue;
        }
        case ChannelType.Webhook: {
          // TODO [DF-471]
          continue;
        }
        default:
          assertUnreachable(node.channel);
      }
      messageStats.push({
        journeyId: journey.id,
        nodeId: node.id,
        stats: {
          sendRate,
          channelStats,
        },
      });
    }
  }

  return messageStats;
}

export async function getJourneysStats({
  workspaceId,
  journeyIds: allJourneyIds,
}: {
  workspaceId: string;
  journeyIds?: string[];
}): Promise<JourneyStats[]> {
  const qb = new ClickHouseQueryBuilder();
  const journeys = await prisma().journey.findMany({
    where: {
      AND: {
        ...(allJourneyIds?.length
          ? {
              id: {
                in: allJourneyIds,
              },
            }
          : {}),
        status: {
          not: JourneyStatus.NotStarted,
        },
        definition: {
          not: Prisma.AnyNull,
        },
      },
    },
  });
  const journeyIds = journeys.map((j) => j.id);
  if (!journeyIds.length) {
    return [];
  }
  const workspaceIdQuery = qb.addQueryValue(workspaceId, "String");
  const journeyIdsQuery = qb.addQueryValue(journeyIds, "Array(String)");

  const query = `
    select
        JSON_VALUE(
            message_raw,
            '$.properties.journeyId'
        ) journey_id,
        JSON_VALUE(
            message_raw,
            '$.properties.nodeId'
        ) node_id,
        uniq(message_id) as count
    from user_events_v2
    where
        workspace_id = ${workspaceIdQuery}
        and journey_id in ${journeyIdsQuery}
        and event_type = 'track'
        and event = 'DFJourneyNodeProcessed'
    group by journey_id, node_id
`;

  const enrichedJourneys = journeys.map((journey) =>
    unwrap(enrichJourney(journey)),
  );

  const [statsResultSet, messageStats] = await Promise.all([
    chQuery({
      query,
      query_params: qb.getQueries(),
      format: "JSONEachRow",
    }),
    getJourneyMessageStats({
      workspaceId,
      journeys: enrichedJourneys.flatMap((j) => {
        if (!j.definition) {
          return [];
        }
        const nodes = j.definition.nodes.flatMap((n) => {
          if (n.type !== JourneyNodeType.MessageNode) {
            return [];
          }
          return {
            id: n.id,
            channel: n.variant.type,
          };
        });
        if (!nodes.length) {
          return [];
        }
        return {
          id: j.id,
          nodes,
        };
      }),
    }),
  ]);

  const stream = statsResultSet.stream();
  // journey id -> node id -> count
  const journeyNodeProcessedMap = new Map<string, Map<string, number>>();

  const rowPromises: Promise<unknown>[] = [];
  stream.on("data", (rows: Row[]) => {
    rows.forEach((row: Row) => {
      const promise = (async () => {
        const json = await row.json();
        const validated = schemaValidateWithErr(json, JourneyMessageStatsRow);
        if (validated.isErr()) {
          logger().error(
            { workspaceId, err: validated.error },
            "Failed to validate row from clickhouse for journey stats",
          );
          return;
        }
        const {
          node_id: nodeId,
          count,
          journey_id: journeyId,
        } = validated.value;

        const nodeMap =
          journeyNodeProcessedMap.get(journeyId) ?? new Map<string, number>();
        nodeMap.set(nodeId, parseInt(count));
        journeyNodeProcessedMap.set(journeyId, nodeMap);
      })();
      rowPromises.push(promise);
    });
  });

  await Promise.all([
    new Promise((resolve) => {
      stream.on("end", () => {
        resolve(0);
      });
    }),
    ...rowPromises,
  ]);

  const journeysStats: JourneyStats[] = [];

  for (const journey of enrichedJourneys) {
    const journeyId = journey.id;
    const { definition } = journey;

    if (!definition) {
      continue;
    }
    const nodeProcessedMap = journeyNodeProcessedMap.get(journeyId);
    if (!nodeProcessedMap) {
      continue;
    }

    const stats: JourneyStats = {
      workspaceId,
      journeyId,
      nodeStats: {},
    };
    journeysStats.push(stats);
    const heritageMap = buildHeritageMap(definition);

    for (const node of definition.nodes) {
      switch (node.type) {
        case JourneyNodeType.MessageNode: {
          const nodeMessageStats =
            messageStats.find(
              (s) => s.journeyId === journey.id && s.nodeId === node.id,
            )?.stats ?? {};
          stats.nodeStats[node.id] = {
            type: NodeStatsType.MessageNodeStats,
            proportions: {
              childEdge: 100,
            },
            ...nodeMessageStats,
          };
          break;
        }
        case JourneyNodeType.DelayNode: {
          stats.nodeStats[node.id] = {
            type: NodeStatsType.DelayNodeStats,
            proportions: {
              childEdge: 100,
            },
          };
          break;
        }
        case JourneyNodeType.SegmentSplitNode: {
          const percent = getEdgePercent({
            originId: node.id,
            targetId: node.variant.falseChild,
            heritageMap,
            nodeProcessedMap,
          });
          if (percent === null) {
            continue;
          }
          stats.nodeStats[node.id] = {
            type: NodeStatsType.SegmentSplitNodeStats,
            proportions: {
              falseChildEdge: percent,
            },
          };
          break;
        }
        case JourneyNodeType.WaitForNode: {
          const segmentChild = node.segmentChildren[0];
          if (segmentChild) {
            const percent = getEdgePercent({
              originId: node.id,
              targetId: segmentChild.id,
              heritageMap,
              nodeProcessedMap,
            });
            if (percent === null) {
              continue;
            }
            stats.nodeStats[node.id] = {
              type: NodeStatsType.WaitForNodeStats,
              proportions: {
                segmentChildEdge: percent,
              },
            };
          }
          break;
        }
        case JourneyNodeType.RateLimitNode:
          continue;
        case JourneyNodeType.ExperimentSplitNode:
          continue;
        default:
          assertUnreachable(node);
      }
    }
  }

  return journeysStats;
}

const EVENT_TRIGGER_JOURNEY_CACHE = new NodeCache({
  stdTTL: 30,
  checkperiod: 120,
});

interface EventTriggerJourneyDetails {
  journeyId: string;
  event: string;
  definition: JourneyDefinition;
}

export type TriggerEventEntryJourneysOptions = Omit<
  StartKeyedUserJourneyProps,
  "definition" | "journeyId"
>;

/**
 * Abstracts the triggerEventEntryJourneys function for ease of testing.
 * @param journeyCache - A cache of journey details for a given workspace.
 * @param startKeyedJourneyImpl - The implementation of startKeyedUserJourney to use.
 */
export function triggerEventEntryJourneysFactory({
  startKeyedJourneyImpl,
  journeyCache,
}: {
  journeyCache: NodeCache;
  startKeyedJourneyImpl: typeof startKeyedUserJourney;
}) {
  return async function builtTriggerEventEntryJourneys({
    workspaceId,
    event: triggerEvent,
    userId,
  }: TriggerEventEntryJourneysOptions): Promise<void> {
    let journeyDetails: EventTriggerJourneyDetails[] | undefined =
      journeyCache.get(workspaceId);

    if (!journeyDetails) {
      const allJourneys = await prisma().journey.findMany({
        where: {
          workspaceId,
        },
      });
      journeyDetails = allJourneys.flatMap((j) => {
        const result = toJourneyResource(j);
        if (result.isErr()) {
          logger().error(
            {
              workspaceId,
              journeyId: j.id,
            },
            "Failed to convert journey to resource",
          );
          return [];
        }
        const journey = result.value;
        if (
          journey.status !== JourneyStatus.Running ||
          journey.definition.entryNode.type !== JourneyNodeType.EventEntryNode
        ) {
          return [];
        }
        return {
          event: journey.definition.entryNode.event,
          journeyId: journey.id,
          definition: journey.definition,
        };
      });
      journeyCache.set(workspaceId, journeyDetails);
    }

    const starts: Promise<unknown>[] = journeyDetails.flatMap(
      ({ journeyId, event: journeyEvent, definition }) => {
        if (journeyEvent !== triggerEvent.event) {
          return [];
        }

        return startKeyedJourneyImpl({
          workspaceId,
          userId,
          journeyId,
          event: triggerEvent,
          definition,
        });
      },
    );
    await Promise.all(starts);
  };
}

export const triggerEventEntryJourneys = triggerEventEntryJourneysFactory({
  journeyCache: EVENT_TRIGGER_JOURNEY_CACHE,
  startKeyedJourneyImpl: startKeyedUserJourney,
});

export async function upsertJourney(
  params: UpsertJourneyResource,
): Promise<Result<SavedJourneyResource, JourneyUpsertValidationError>> {
  const { id, name, definition, workspaceId, status, canRunMultiple, draft } =
    params;

  if (id && !validateUuid(id)) {
    return err({
      type: JourneyUpsertValidationErrorType.IdError,
      message: "Invalid journey id, must be a valid v4 UUID",
    });
  }

  if (definition) {
    const constraintViolations = getJourneyConstraintViolations({
      definition,
      newStatus: status,
    });
    if (constraintViolations.length > 0) {
      return err({
        type: JourneyUpsertValidationErrorType.ConstraintViolation,
        violations: constraintViolations,
      });
    }
  }

  // null out the draft when the definition is updated or when the draft is
  // explicitly set to null
  const nullableDraft = definition || draft === null ? Prisma.DbNull : draft;

  const where: Prisma.JourneyWhereUniqueInput = id
    ? { id, workspaceId }
    : { workspaceId_name: { workspaceId, name } };

  const txResult: Result<Journey, JourneyUpsertValidationError> =
    await prisma().$transaction(async (tx) => {
      let journey: Journey | null = await tx.journey.findUnique({
        where,
      });
      if (!journey) {
        try {
          const created: Journey = await tx.journey.create({
            data: {
              id,
              workspaceId,
              name,
              definition,
              draft: nullableDraft,
              status,
              canRunMultiple,
            },
          });

          return ok(created);
        } catch (e) {
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002"
          ) {
            return err({
              type: JourneyUpsertValidationErrorType.UniqueConstraintViolation,
              message:
                "Names must be unique in workspace. Id's must be globally unique.",
            });
          }
          throw e;
        }
      }
      if (
        status === JourneyStatus.Paused &&
        journey.status === JourneyStatus.NotStarted
      ) {
        return err({
          type: JourneyUpsertValidationErrorType.StatusTransitionError,
          message: "Cannot pause a journey that has not been started",
        });
      }

      if (
        status === JourneyStatus.NotStarted &&
        journey.status !== JourneyStatus.NotStarted
      ) {
        return err({
          type: JourneyUpsertValidationErrorType.StatusTransitionError,
          message:
            "Cannot set a journey to NotStarted if it has already been started. Pause the journey instead.",
        });
      }

      let statusUpdatedAt: Date | undefined;
      if (status && status !== journey.status) {
        statusUpdatedAt = new Date();
      }
      journey = await tx.journey.update({
        where,
        data: {
          name,
          definition,
          draft: nullableDraft,
          status,
          statusUpdatedAt,
          canRunMultiple,
        },
      });
      return ok(journey);
    });
  if (txResult.isErr()) {
    return err(txResult.error);
  }
  const journey = txResult.value;
  const journeyDefinitionResult = journey.definition
    ? schemaValidate(journey.definition, JourneyDefinition)
    : undefined;

  // type checker seems not to understand with optional chain
  // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
  if (journeyDefinitionResult && journeyDefinitionResult.isErr()) {
    logger().error(
      {
        workspaceId,
        journeyId: journey.id,
        errors: journeyDefinitionResult.error,
      },
      "Failed to validate journey definition",
    );
    throw new Error("Failed to validate journey definition");
  }

  const journeyDraftResult = journey.draft
    ? schemaValidate(journey.draft, JourneyDraft)
    : undefined;

  // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
  if (journeyDraftResult && journeyDraftResult.isErr()) {
    logger().error(
      {
        workspaceId,
        journeyId: journey.id,
        errors: journeyDraftResult.error,
      },
      "Failed to validate journey draft",
    );
    throw new Error("Failed to validate journey draft");
  }

  const journeyStatus = journey.status;
  const journeyDefinition = journeyDefinitionResult?.value;
  if (journeyStatus !== "NotStarted" && !journeyDefinition) {
    throw new Error("Journey status is not NotStarted but has no definition");
  }

  if (
    status === JourneyStatus.Running &&
    journey.status === JourneyStatus.Paused &&
    journeyDefinition?.entryNode.type === JourneyNodeType.SegmentEntryNode &&
    journeyDefinition.entryNode.reEnter
  ) {
    const priorityStatusUpdatedAt = journey.statusUpdatedAt?.getTime();

    if (priorityStatusUpdatedAt) {
      await restartUserJourneyWorkflow({
        journeyId: journey.id,
        workspaceId,
        statusUpdatedAt: priorityStatusUpdatedAt,
      });
    }
  }

  const baseResource = {
    id: journey.id,
    name: journey.name,
    workspaceId: journey.workspaceId,
    draft: journeyDraftResult?.value,
    updatedAt: Number(journey.updatedAt),
    createdAt: Number(journey.createdAt),
  } as const;

  let resource: SavedJourneyResource;
  if (journeyStatus === "NotStarted") {
    resource = {
      ...baseResource,
      status: journeyStatus,
      definition: journeyDefinition,
    };
  } else {
    if (!journeyDefinition) {
      logger().error(
        {
          journeyId: journey.id,
        },
        "Journey status is not NotStarted but has no definition",
      );
      throw new Error("Journey status is not NotStarted but has no definition");
    }
    resource = {
      ...baseResource,
      status: journeyStatus,
      definition: journeyDefinition,
    };
  }

  return ok(resource);
}
