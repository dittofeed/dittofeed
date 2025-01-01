import { Broadcast } from "@prisma/client";
import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  BroadcastResource,
  ChannelType,
  EmailContentsType,
  JourneyDefinition,
  JourneyNodeType,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  SavedHasStartedJourneyResource,
  SavedSegmentResource,
  SegmentDefinition,
  SegmentNodeType,
} from "isomorphic-lib/src/types";

import {
  broadcastWorkflow,
  generateBroadcastWorkflowId,
} from "./computedProperties/broadcastWorkflow";
import { db, insert, upsert } from "./db";
import {
  broadcast as dbBroadcast,
  defaultEmailProvider as dbDefaultEmailProvider,
  defaultSmsProvider as dbDefaultSmsProvider,
  journey as dbJourney,
  messageTemplate as dbMessageTemplate,
  segment as dbSegment,
  subscriptionGroup as dbSubscriptionGroup,
} from "./db/schema";
import { toJourneyResource, upsertJourney } from "./journeys";
import logger from "./logger";
import { enrichMessageTemplate } from "./messaging";
import { defaultEmailDefinition } from "./messaging/email";
import { toSegmentResource } from "./segments";
import connectWorkflowClient from "./temporal/connectWorkflowClient";
import { isAlreadyStartedError } from "./temporal/workflow";

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

export function toBroadcastResource(
  broadcast: Broadcast | typeof dbBroadcast.$inferSelect,
): BroadcastResource {
  const resource: BroadcastResource = {
    workspaceId: broadcast.workspaceId,
    id: broadcast.id,
    name: broadcast.name,
    segmentId: broadcast.segmentId ?? undefined,
    journeyId: broadcast.journeyId ?? undefined,
    messageTemplateId: broadcast.messageTemplateId ?? undefined,
    triggeredAt: broadcast.triggeredAt
      ? new Date(broadcast.triggeredAt).getTime()
      : undefined,
    status: broadcast.status,
    createdAt: new Date(broadcast.createdAt).getTime(),
    updatedAt: new Date(broadcast.updatedAt).getTime(),
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
      values: {
        id: randomUUID(),
        workspaceId,
        name: broadcastSegmentName,
        definition: segmentDefinition,
        resourceType: "Internal",
        status: "NotStarted",
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    }).then(unwrap),
    insert({
      table: dbMessageTemplate,
      doNothingOnConflict: true,
      values: {
        id: randomUUID(),
        workspaceId,
        resourceType: "Internal",
        name: broadcastTemplateName,
        definition: messageTemplateDefinition,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
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
      values: {
        id,
        workspaceId,
        name: broadcastJourneyName,
        definition: journeyDefinition,
        resourceType: "Internal",
        status: "Broadcast",
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    }),
  );
  const broadcast = unwrap(
    await insert({
      table: dbBroadcast,
      doNothingOnConflict: true,
      values: {
        id,
        workspaceId,
        name,
        segmentId: segment.id,
        journeyId: journey.id,
        messageTemplateId: messageTemplate.id,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
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
  const broadcast = await prisma().broadcast.findUniqueOrThrow({
    where: {
      id: broadcastId,
    },
  });
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

  const updatedBroadcast = await prisma().broadcast.update({
    where: {
      id: broadcastId,
    },
    data: {
      status: "InProgress",
    },
  });
  return toBroadcastResource(updatedBroadcast);
}
