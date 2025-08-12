import { and, asc, desc, eq, inArray, SQL } from "drizzle-orm";
import {
  getBroadcastJourneyName,
  getBroadcastSegmentName,
  getBroadcastTemplateName,
} from "isomorphic-lib/src/broadcasts";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  BroadcastResource,
  BroadcastResourceV2,
  BroadcastV2Config,
  BroadcastV2Status,
  ChannelType,
  EmailContentsType,
  GetBroadcastsResponse,
  GetBroadcastsV2Request,
  JourneyDefinition,
  JourneyNodeType,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  SavedHasStartedJourneyResource,
  SavedSegmentResource,
  SegmentDefinition,
  SegmentNodeType,
  UpdateBroadcastArchiveRequest,
  UpsertBroadcastV2Error,
  UpsertBroadcastV2ErrorTypeEnum,
  UpsertBroadcastV2Request,
} from "isomorphic-lib/src/types";
import { err, ok, Result } from "neverthrow";
import { validate as validateUuid } from "uuid";

import {
  broadcastWorkflow,
  generateBroadcastWorkflowId,
} from "./computedProperties/broadcastWorkflow";
import { db, insert, PostgresError, queryResult } from "./db";
import {
  broadcast as dbBroadcast,
  defaultEmailProvider as dbDefaultEmailProvider,
  journey as dbJourney,
  messageTemplate as dbMessageTemplate,
  segment as dbSegment,
  subscriptionGroup as dbSubscriptionGroup,
} from "./db/schema";
import { toJourneyResource } from "./journeys";
import logger from "./logger";
import { enrichMessageTemplate } from "./messaging";
import { defaultEmailDefinition } from "./messaging/email";
import { toSegmentResource } from "./segments";
import connectWorkflowClient from "./temporal/connectWorkflowClient";
import { isAlreadyStartedError } from "./temporal/workflow";
import { Broadcast, SubscriptionGroup } from "./types";

export function toBroadcastResource(broadcast: Broadcast): BroadcastResource {
  if (broadcast.status === null) {
    logger().error(
      {
        broadcast,
      },
      "Broadcast status is null",
    );
    throw new Error("Broadcast status is null");
  }
  const resource: BroadcastResource = {
    workspaceId: broadcast.workspaceId,
    id: broadcast.id,
    name: broadcast.name,
    segmentId: broadcast.segmentId ?? undefined,
    journeyId: broadcast.journeyId ?? undefined,
    messageTemplateId: broadcast.messageTemplateId ?? undefined,
    archived: broadcast.archived,
    triggeredAt: broadcast.triggeredAt
      ? broadcast.triggeredAt.getTime()
      : undefined,
    status: broadcast.status,
    createdAt: broadcast.createdAt.getTime(),
    updatedAt: broadcast.updatedAt.getTime(),
    version: "V1",
  };
  return resource;
}

export interface BroadcastResources {
  broadcast: BroadcastResource;
  segment: SavedSegmentResource;
  messageTemplate: MessageTemplateResource;
  journey: SavedHasStartedJourneyResource;
}

export async function getBroadcast({
  workspaceId,
  broadcastId: id,
}: {
  broadcastId: string;
  workspaceId: string;
}): Promise<BroadcastResources | null> {
  const broadcastSegmentName = getBroadcastSegmentName({ broadcastId: id });
  const broadcastTemplateName = getBroadcastTemplateName({ broadcastId: id });
  const broadcastJourneyName = getBroadcastJourneyName({ broadcastId: id });

  const [broadcast, segment, messageTemplate] = await Promise.all([
    db().query.broadcast.findFirst({
      where: eq(dbBroadcast.id, id),
    }),
    db().query.segment.findFirst({
      where: and(
        eq(dbSegment.workspaceId, workspaceId),
        eq(dbSegment.name, broadcastSegmentName),
      ),
    }),
    db().query.messageTemplate.findFirst({
      where: and(
        eq(dbMessageTemplate.workspaceId, workspaceId),
        eq(dbMessageTemplate.name, broadcastTemplateName),
      ),
    }),
  ]);

  const journey = await db().query.journey.findFirst({
    where: and(
      eq(dbJourney.workspaceId, workspaceId),
      eq(dbJourney.name, broadcastJourneyName),
    ),
  });

  if (!broadcast || !segment || !messageTemplate || !journey) {
    return null;
  }

  const journeyResource = unwrap(toJourneyResource(journey));
  if (journeyResource.status !== "Broadcast") {
    logger().error(
      {
        journey: journeyResource,
      },
      "Journey does not have the broadcast status.",
    );
    return null;
  }
  return {
    broadcast: toBroadcastResource(broadcast),
    journey: journeyResource,
    messageTemplate: unwrap(enrichMessageTemplate(messageTemplate)),
    segment: unwrap(toSegmentResource(segment)),
  };
}

const DEFAULT_BROADCAST_SEGMENT_DEFINITION: SegmentDefinition = {
  entryNode: {
    type: SegmentNodeType.Everyone,
    id: "1",
  },
  nodes: [],
};

export async function upsertBroadcast({
  workspaceId,
  broadcastId: id,
  subscriptionGroupId: sgId,
  name,
  segmentDefinition = DEFAULT_BROADCAST_SEGMENT_DEFINITION,
  messageTemplateDefinition: mDefinition,
}: {
  broadcastId: string;
  workspaceId: string;
  subscriptionGroupId?: string;
  name: string;
  segmentDefinition?: SegmentDefinition;
  messageTemplateDefinition?: MessageTemplateResourceDefinition;
}): Promise<BroadcastResources> {
  const broadcastSegmentName = getBroadcastSegmentName({ broadcastId: id });
  const broadcastTemplateName = getBroadcastTemplateName({ broadcastId: id });
  const broadcastJourneyName = getBroadcastJourneyName({ broadcastId: id });
  logger().info(
    {
      sgId,
      segmentDefinition,
    },
    "Upserting broadcast",
  );

  let messageTemplateDefinition: MessageTemplateResourceDefinition;
  if (mDefinition) {
    messageTemplateDefinition = mDefinition;
  } else {
    const defaultEmailProvider =
      await db().query.defaultEmailProvider.findFirst({
        where: eq(dbDefaultEmailProvider.workspaceId, workspaceId),
      });
    messageTemplateDefinition = defaultEmailDefinition({
      emailContentsType: EmailContentsType.LowCode,
      emailProvider: defaultEmailProvider ?? undefined,
    });
  }
  logger().info(
    { messageTemplateDefinition, segmentDefinition },
    "Broadcast definitions",
  );
  const [segment, messageTemplate, subscriptionGroup] = await Promise.all([
    insert({
      table: dbSegment,
      doNothingOnConflict: true,
      lookupExisting: and(
        eq(dbSegment.workspaceId, workspaceId),
        eq(dbSegment.name, broadcastSegmentName),
      )!,
      values: {
        workspaceId,
        name: broadcastSegmentName,
        definition: segmentDefinition,
        resourceType: "Internal",
        status: "NotStarted",
      },
    }).then(unwrap),
    insert({
      table: dbMessageTemplate,
      doNothingOnConflict: true,
      lookupExisting: and(
        eq(dbMessageTemplate.workspaceId, workspaceId),
        eq(dbMessageTemplate.name, broadcastTemplateName),
      )!,
      values: {
        workspaceId,
        resourceType: "Internal",
        name: broadcastTemplateName,
        definition: messageTemplateDefinition,
      },
    }).then(unwrap),
    db().query.subscriptionGroup.findFirst({
      where: and(
        eq(dbSubscriptionGroup.workspaceId, workspaceId),
        eq(dbSubscriptionGroup.channel, mDefinition?.type ?? ChannelType.Email),
      ),
      orderBy: [asc(dbSubscriptionGroup.createdAt)],
    }),
  ]);

  const journeyDefinition: JourneyDefinition = {
    entryNode: {
      type: JourneyNodeType.SegmentEntryNode,
      segment: segment.id,
      child: "broadcast-message",
    },
    nodes: [
      {
        id: "broadcast-message",
        type: JourneyNodeType.MessageNode,
        name: "Broadcast Message",
        subscriptionGroupId: sgId ?? subscriptionGroup?.id,
        variant: {
          type: ChannelType.Email,
          templateId: messageTemplate.id,
        },
        child: JourneyNodeType.ExitNode,
      },
    ],
    exitNode: {
      type: JourneyNodeType.ExitNode,
    },
  };

  const journey = unwrap(
    await insert({
      table: dbJourney,
      doNothingOnConflict: true,
      lookupExisting: and(
        eq(dbJourney.workspaceId, workspaceId),
        eq(dbJourney.name, broadcastJourneyName),
      )!,
      values: {
        workspaceId,
        name: broadcastJourneyName,
        definition: journeyDefinition,
        resourceType: "Internal",
        status: "Broadcast",
      },
    }),
  );
  const broadcast = unwrap(
    await insert({
      table: dbBroadcast,
      doNothingOnConflict: true,
      lookupExisting: and(
        eq(dbBroadcast.id, id),
        eq(dbBroadcast.workspaceId, workspaceId),
      )!,
      values: {
        id,
        workspaceId,
        name,
        segmentId: segment.id,
        journeyId: journey.id,
        messageTemplateId: messageTemplate.id,
      },
    }),
  );

  const journeyResource = unwrap(toJourneyResource(journey));
  if (journeyResource.status !== "Broadcast") {
    throw new Error("Journey does not have the broadcast status.");
  }

  return {
    broadcast: toBroadcastResource(broadcast),
    journey: journeyResource,
    messageTemplate: unwrap(enrichMessageTemplate(messageTemplate)),
    segment: unwrap(toSegmentResource(segment)),
  };
}

export async function getOrCreateBroadcast(params: {
  broadcastId: string;
  workspaceId: string;
  name: string;
  segmentDefinition?: SegmentDefinition;
}): Promise<BroadcastResources> {
  const broadcastResources = await getBroadcast(params);
  if (broadcastResources) {
    return broadcastResources;
  }
  return upsertBroadcast(params);
}

export async function triggerBroadcast({
  broadcastId,
  workspaceId,
}: {
  broadcastId: string;
  workspaceId: string;
}): Promise<BroadcastResource> {
  const temporalClient = await connectWorkflowClient();
  const broadcast = await db().query.broadcast.findFirst({
    where: and(
      eq(dbBroadcast.id, broadcastId),
      eq(dbBroadcast.workspaceId, workspaceId),
    ),
  });
  if (!broadcast) {
    logger().error(
      {
        broadcastId,
        workspaceId,
      },
      "Broadcast not found",
    );
    throw new Error("Broadcast not found");
  }

  if (broadcast.status !== "NotStarted") {
    logger().error(
      {
        broadcast,
        workspaceId,
      },
      "Broadcast is not in the NotStarted status.",
    );
    return toBroadcastResource(broadcast);
  }

  try {
    await temporalClient.start(broadcastWorkflow, {
      taskQueue: "default",
      workflowId: generateBroadcastWorkflowId({
        workspaceId,
        broadcastId,
      }),
      args: [
        {
          workspaceId,
          broadcastId,
        },
      ],
    });
  } catch (e) {
    if (!isAlreadyStartedError(e)) {
      throw e;
    }
  }

  const [updatedBroadcast] = await db()
    .update(dbBroadcast)
    .set({
      status: "InProgress",
    })
    .where(
      and(
        eq(dbBroadcast.id, broadcastId),
        eq(dbBroadcast.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (updatedBroadcast == null) {
    logger().error(
      {
        broadcastId,
        workspaceId,
      },
      "Broadcast not found",
    );
    throw new Error("Broadcast not found");
  }
  return toBroadcastResource(updatedBroadcast);
}

export function broadcastV2ToResource(
  broadcast: Broadcast,
): BroadcastResourceV2 {
  if (broadcast.statusV2 === null) {
    throw new Error("Broadcast statusV2 is null");
  }
  if (broadcast.version && broadcast.version !== "V2") {
    throw new Error("Broadcast version is not V2");
  }
  const config = unwrap(
    schemaValidateWithErr(broadcast.config, BroadcastV2Config),
  );
  if (broadcast.version !== "V2") {
    throw new Error("Broadcast version is not V2");
  }
  return {
    id: broadcast.id,
    name: broadcast.name,
    status: broadcast.statusV2,
    createdAt: broadcast.createdAt.getTime(),
    updatedAt: broadcast.updatedAt.getTime(),
    workspaceId: broadcast.workspaceId,
    version: broadcast.version,
    config,
    scheduledAt: broadcast.scheduledAt ?? undefined,
    segmentId: broadcast.segmentId ?? undefined,
    subscriptionGroupId: broadcast.subscriptionGroupId ?? undefined,
    messageTemplateId: broadcast.messageTemplateId ?? undefined,
    archived: broadcast.archived,
  };
}

export async function upsertBroadcastV2({
  workspaceId,
  id,
  name,
  segmentId,
  messageTemplateId,
  subscriptionGroupId,
  config,
  scheduledAt,
}: UpsertBroadcastV2Request): Promise<
  Result<BroadcastResourceV2, UpsertBroadcastV2Error>
> {
  if (id && !validateUuid(id)) {
    return err({
      type: UpsertBroadcastV2ErrorTypeEnum.IdError,
      message: "Invalid UUID",
    });
  }
  const result: Result<BroadcastResourceV2, UpsertBroadcastV2Error> =
    await db().transaction(async (tx) => {
      let existingModel: Broadcast | undefined;
      if (id) {
        existingModel = await tx.query.broadcast.findFirst({
          where: and(
            eq(dbBroadcast.id, id),
            eq(dbBroadcast.workspaceId, workspaceId),
          ),
        });
      } else if (name) {
        existingModel = await tx.query.broadcast.findFirst({
          where: and(
            eq(dbBroadcast.name, name),
            eq(dbBroadcast.workspaceId, workspaceId),
          ),
        });
      }
      const existing: BroadcastResourceV2 | undefined = existingModel
        ? broadcastV2ToResource(existingModel)
        : undefined;

      const [messageTemplate, subscriptionGroup] = await Promise.all([
        messageTemplateId
          ? tx.query.messageTemplate.findFirst({
              where: and(
                eq(dbMessageTemplate.id, messageTemplateId),
                eq(dbMessageTemplate.workspaceId, workspaceId),
              ),
            })
          : null,
        subscriptionGroupId
          ? tx.query.subscriptionGroup.findFirst({
              where: and(
                eq(dbSubscriptionGroup.id, subscriptionGroupId),
                eq(dbSubscriptionGroup.workspaceId, workspaceId),
              ),
            })
          : null,
      ]);
      if (messageTemplate === undefined || subscriptionGroup === undefined) {
        return err({
          type: UpsertBroadcastV2ErrorTypeEnum.ConstraintViolation,
          message:
            "The segment, message template, or subscription group does not exist",
        });
      }
      const messageTemplateDefinition = messageTemplate
        ? unwrap(enrichMessageTemplate(messageTemplate)).definition
        : null;

      const channels = new Set<ChannelType>();
      if (messageTemplateDefinition) {
        channels.add(messageTemplateDefinition.type);
      }
      if (subscriptionGroup) {
        channels.add(subscriptionGroup.channel);
      }
      if (config) {
        channels.add(config.message.type);
      }
      if (channels.size > 1) {
        return err({
          type: UpsertBroadcastV2ErrorTypeEnum.ConstraintViolation,
          message:
            "The message template, subscription group, and broadcast config must all be the same channel type",
        });
      }
      let broadcast: Broadcast;
      if (existing) {
        const updateResult = await queryResult(
          tx
            .update(dbBroadcast)
            .set({
              name,
              segmentId,
              messageTemplateId,
              subscriptionGroupId,
              config,
              scheduledAt,
            })
            .where(
              and(
                eq(dbBroadcast.id, existing.id),
                eq(dbBroadcast.workspaceId, workspaceId),
              ),
            )
            .returning(),
        );

        if (updateResult.isErr()) {
          if (updateResult.error.code === PostgresError.FOREIGN_KEY_VIOLATION) {
            return err({
              type: UpsertBroadcastV2ErrorTypeEnum.ConstraintViolation,
              message:
                "The segment, message template, or subscription group does not exist",
            });
          }
          if (updateResult.error.code === PostgresError.UNIQUE_VIOLATION) {
            return err({
              type: UpsertBroadcastV2ErrorTypeEnum.UniqueConstraintViolation,
              message: "The broadcast name must be unique",
            });
          }
          logger().error(
            {
              err: updateResult.error,
              broadcastId: existing.id,
              workspaceId,
            },
            "Failed to update broadcast",
          );
          throw updateResult.error;
        }
        const updatedBroadcast = updateResult.value[0];
        if (!updatedBroadcast) {
          logger().error(
            {
              broadcastId: existing.id,
              workspaceId,
            },
            "Broadcast not found",
          );
          throw new Error("Broadcast not found");
        }
        broadcast = updatedBroadcast;
      } else {
        if (!name) {
          return err({
            type: UpsertBroadcastV2ErrorTypeEnum.MissingRequiredFields,
            message: "Name is required when creating a new broadcast",
          });
        }
        const channel: ChannelType =
          Array.from(channels)[0] ?? ChannelType.Email;

        if (channel === ChannelType.MobilePush) {
          return err({
            type: UpsertBroadcastV2ErrorTypeEnum.ConstraintViolation,
            message: "Mobile push is not supported yet",
          });
        }

        let messageConfig: BroadcastV2Config["message"];
        switch (channel) {
          case ChannelType.Email:
            messageConfig = {
              type: channel,
            };
            break;
          case ChannelType.Sms:
            messageConfig = {
              type: channel,
            };
            break;
          case ChannelType.Webhook:
            messageConfig = {
              type: channel,
            };
            break;
          default:
            throw new Error("Unsupported channel type");
        }

        let defaultSubscriptionGroup: SubscriptionGroup | undefined;
        if (!subscriptionGroupId) {
          defaultSubscriptionGroup =
            await db().query.subscriptionGroup.findFirst({
              where: and(
                eq(dbSubscriptionGroup.workspaceId, workspaceId),
                eq(dbSubscriptionGroup.channel, channel),
              ),
              orderBy: [asc(dbSubscriptionGroup.createdAt)],
            });
        }

        const insertedConfig: BroadcastV2Config = config ?? {
          type: "V2",
          message: messageConfig,
        };
        const subscriptionGroupIdWithDefault =
          subscriptionGroupId ?? defaultSubscriptionGroup?.id;
        const insertResult = await queryResult(
          tx
            .insert(dbBroadcast)
            .values({
              id,
              name,
              workspaceId,
              segmentId,
              messageTemplateId,
              subscriptionGroupId: subscriptionGroupIdWithDefault,
              version: "V2",
              config: insertedConfig,
              scheduledAt,
            })
            .returning(),
        );
        if (insertResult.isErr()) {
          if (
            insertResult.error.code === PostgresError.FOREIGN_KEY_VIOLATION ||
            insertResult.error.code === PostgresError.UNIQUE_VIOLATION
          ) {
            return err({
              type: UpsertBroadcastV2ErrorTypeEnum.ConstraintViolation,
              message:
                "Make sure the segment, message template, and subscription group exists, and that the name and id satisfy unique constraints.",
            });
          }
          logger().error(
            {
              err: insertResult.error,
              workspaceId,
              broadcastId: id,
              name,
            },
            "Failed to insert broadcast",
          );
          throw insertResult.error;
        }
        const insertedBroadcast = insertResult.value[0];
        if (!insertedBroadcast) {
          throw new Error("Broadcast not found");
        }
        broadcast = insertedBroadcast;
      }
      return ok(broadcastV2ToResource(broadcast));
    });
  return result;
}

export async function getBroadcastsV2({
  workspaceId,
  ids,
}: GetBroadcastsV2Request): Promise<GetBroadcastsResponse> {
  const conditions: SQL[] = [eq(dbBroadcast.workspaceId, workspaceId)];
  if (ids) {
    conditions.push(inArray(dbBroadcast.id, ids));
  }
  const broadcasts = await db().query.broadcast.findMany({
    where: and(...conditions),
    orderBy: [desc(dbBroadcast.createdAt)],
  });
  // eslint-disable-next-line array-callback-return
  return broadcasts.map((b) => {
    const { version } = b;
    switch (version) {
      case null:
      case "V1":
        return toBroadcastResource(b);
      case "V2":
        return broadcastV2ToResource(b);
      default:
        assertUnreachable(version);
    }
  });
}

export async function archiveBroadcast({
  workspaceId,
  broadcastId,
  archived,
}: UpdateBroadcastArchiveRequest): Promise<boolean> {
  const result = await db()
    .update(dbBroadcast)
    .set({
      archived,
    })
    .where(
      and(
        eq(dbBroadcast.id, broadcastId),
        eq(dbBroadcast.workspaceId, workspaceId),
      ),
    )
    .returning();
  return result.length > 0;
}

function canTransitionToStatus(
  currentStatus: BroadcastV2Status,
  newStatus: BroadcastV2Status,
): boolean {
  // Cannot transition to the same status
  if (currentStatus === newStatus) {
    return false;
  }

  switch (currentStatus) {
    case "Draft":
      // From Draft, can start (Running), schedule, or cancel
      return (
        newStatus === "Running" ||
        newStatus === "Scheduled" ||
        newStatus === "Cancelled"
      );

    case "Scheduled":
      // From Scheduled, can start (Running) or cancel
      return newStatus === "Running" || newStatus === "Cancelled";

    case "Running":
      // From Running, can pause, complete, fail, or cancel
      return (
        newStatus === "Paused" ||
        newStatus === "Completed" ||
        newStatus === "Failed" ||
        newStatus === "Cancelled"
      );

    case "Paused":
      // From Paused, can resume (Running), fail, or cancel
      return (
        newStatus === "Running" ||
        newStatus === "Failed" ||
        newStatus === "Cancelled"
      );

    case "Completed":
      // Completed is a terminal state - no transitions allowed
      return false;

    case "Cancelled":
      // Cancelled is a terminal state - no transitions allowed
      return false;

    case "Failed":
      // Failed is a terminal state - no transitions allowed
      return false;

    default:
      // Unknown status - disallow transition
      return false;
  }
}

export async function markBroadcastStatus({
  workspaceId,
  broadcastId,
  status,
}: {
  workspaceId: string;
  broadcastId: string;
  status: BroadcastV2Status;
}): Promise<BroadcastV2Status | null> {
  const result: BroadcastV2Status | null = await db().transaction(
    async (tx) => {
      const existing = await tx.query.broadcast.findFirst({
        where: and(
          eq(schema.broadcast.id, broadcastId),
          eq(schema.broadcast.workspaceId, workspaceId),
        ),
      });
      if (!existing) {
        return null;
      }
      if (existing.statusV2 === status) {
        return existing.statusV2;
      }
      if (existing.statusV2 === null) {
        logger().error(
          {
            broadcastId,
            workspaceId,
            status,
          },
          "Broadcast status is null",
        );
        return null;
      }
      if (!canTransitionToStatus(existing.statusV2, status)) {
        logger().error(
          {
            broadcastId,
            workspaceId,
            status,
            currentStatus: existing.statusV2,
          },
          "Broadcast status transition is not valid",
        );
        return null;
      }
      await tx
        .update(dbBroadcast)
        .set({
          statusV2: status,
        })
        .where(
          and(
            eq(dbBroadcast.id, broadcastId),
            eq(dbBroadcast.workspaceId, workspaceId),
          ),
        );
      return status;
    },
  );
  return result;
}
