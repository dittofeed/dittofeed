import { Broadcast } from "@prisma/client";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  BroadcastResource,
  ChannelType,
  EmailContentsType,
  JourneyDefinition,
  JourneyNodeType,
  MessageTemplateResource,
  SavedHasStartedJourneyResource,
  SavedSegmentResource,
  SegmentDefinition,
} from "isomorphic-lib/src/types";

import { DEFAULT_SEGMENT_DEFINITION } from "./constants";
import { toJourneyResource } from "./journeys";
import logger from "./logger";
import { enrichMessageTemplate } from "./messaging";
import { defaultEmailDefinition } from "./messaging/email";
import prisma from "./prisma";
import { toSegmentResource } from "./segments";

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
    prisma().broadcast.findUnique({
      where: {
        id,
      },
    }),
    prisma().segment.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: broadcastSegmentName,
        },
      },
    }),
    prisma().messageTemplate.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: broadcastTemplateName,
        },
      },
    }),
  ]);

  const journey = await prisma().journey.findUnique({
    where: {
      workspaceId_name: {
        workspaceId,
        name: broadcastJourneyName,
      },
    },
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

export async function upsertBroadcast({
  workspaceId,
  broadcastId: id,
  subscriptionGroupId,
  name,
}: {
  broadcastId: string;
  workspaceId: string;
  subscriptionGroupId?: string;
  name: string;
}): Promise<BroadcastResources> {
  const segmentDefinition: SegmentDefinition = DEFAULT_SEGMENT_DEFINITION;
  const broadcastSegmentName = getBroadcastSegmentName({ broadcastId: id });
  const broadcastTemplateName = getBroadcastTemplateName({ broadcastId: id });
  const broadcastJourneyName = getBroadcastJourneyName({ broadcastId: id });
  const defaultEmailProvider = await prisma().defaultEmailProvider.findUnique({
    where: {
      workspaceId,
    },
  });
  const [segment, messageTemplate] = await Promise.all([
    prisma().segment.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: broadcastSegmentName,
        },
      },
      create: {
        workspaceId,
        name: broadcastSegmentName,
        definition: segmentDefinition,
        resourceType: "Internal",
        status: "NotStarted",
      },
      update: {},
    }),
    prisma().messageTemplate.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: broadcastTemplateName,
        },
      },
      create: {
        workspaceId,
        resourceType: "Internal",
        name: broadcastTemplateName,
        definition: defaultEmailDefinition({
          emailContentsType: EmailContentsType.LowCode,
          emailProvider: defaultEmailProvider ?? undefined,
        }),
      },
      update: {},
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
        subscriptionGroupId,
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

  const journey = await prisma().journey.upsert({
    where: {
      workspaceId_name: {
        workspaceId,
        name: broadcastJourneyName,
      },
    },
    create: {
      workspaceId,
      name: broadcastJourneyName,
      definition: journeyDefinition,
      resourceType: "Internal",
      status: "Broadcast",
    },
    update: {},
  });
  const broadcast = await prisma().broadcast.upsert({
    where: {
      id,
    },
    create: {
      id,
      workspaceId,
      name,
      segmentId: segment.id,
      journeyId: journey.id,
      messageTemplateId: messageTemplate.id,
    },
    update: {},
  });

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
}): Promise<BroadcastResources> {
  const broadcastResources = await getBroadcast(params);
  if (broadcastResources) {
    return broadcastResources;
  }
  return upsertBroadcast(params);
}
