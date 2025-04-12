import { and, asc, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  BroadcastResource,
  BroadcastResourceV2,
  BroadcastV2Config,
  ChannelType,
  EmailContentsType,
  JourneyDefinition,
  JourneyNodeType,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  MessageVariant,
  SavedHasStartedJourneyResource,
  SavedSegmentResource,
  SegmentDefinition,
  SegmentNodeType,
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
import { Broadcast } from "./types";

export function getBroadcastSegmentName({
  broadcastId,
}: {
  broadcastId: string;
}): string {
  return `Broadcast - ${broadcastId}`;
}

export function getBroadcastTemplateName({
  broadcastId,
}: {
  broadcastId: string;
}): string {
  return `Broadcast - ${broadcastId}`;
}

export function getBroadcastJourneyName({
  broadcastId,
}: {
  broadcastId: string;
}): string {
  return `Broadcast - ${broadcastId}`;
}

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
    triggeredAt: broadcast.triggeredAt
      ? broadcast.triggeredAt.getTime()
      : undefined,
    status: broadcast.status,
    createdAt: broadcast.createdAt.getTime(),
    updatedAt: broadcast.updatedAt.getTime(),
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
  const config = unwrap(
    schemaValidateWithErr(broadcast.config, BroadcastV2Config),
  );
  return {
    id: broadcast.id,
    name: broadcast.name,
    status: broadcast.statusV2,
    createdAt: broadcast.createdAt.getTime(),
    updatedAt: broadcast.updatedAt.getTime(),
    workspaceId: broadcast.workspaceId,
    config,
    scheduledAt: broadcast.scheduledAt ?? undefined,
    segmentId: broadcast.segmentId ?? undefined,
    messageTemplateId: broadcast.messageTemplateId ?? undefined,
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
      if (
        messageTemplateId === undefined ||
        subscriptionGroupId === undefined
      ) {
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

        const messageConfig: BroadcastV2Config["message"] = {
          // FIXME
          type: "Email",
        };

        const insertedConfig: BroadcastV2Config = config ?? {
          type: "V2",
          message: messageConfig,
        };
        const insertResult = await queryResult(
          tx
            .insert(dbBroadcast)
            .values({
              name,
              workspaceId,
              segmentId,
              messageTemplateId,
              subscriptionGroupId,
              config: insertedConfig,
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
