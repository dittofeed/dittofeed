import { Broadcast } from "@prisma/client";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  BroadcastResource,
  ChannelType,
  JourneyDefinition,
  JourneyNodeType,
  MessageTemplateResource,
  SavedJourneyResource,
  SavedSegmentResource,
  SegmentDefinition,
} from "isomorphic-lib/src/types";

import { WELCOME_TEMPLATE } from "./bootstrap/messageTemplates";
import { DEFAULT_SEGMENT_DEFINITION } from "./constants";
import { toJourneyResource } from "./journeys";
import { enrichMessageTemplate } from "./messageTemplates";
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
  };
  return resource;
}

export interface BroadcastResources {
  broadcast: BroadcastResource;
  segment: SavedSegmentResource;
  messageTemplate: MessageTemplateResource;
  journey: SavedJourneyResource;
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
  return {
    broadcast: toBroadcastResource(broadcast),
    journey: unwrap(toJourneyResource(journey)),
    messageTemplate: unwrap(enrichMessageTemplate(messageTemplate)),
    segment: unwrap(toSegmentResource(segment)),
  };
}

export async function upsertBroadcast({
  workspaceId,
  broadcastId: id,
  subscriptionGroupId,
}: {
  broadcastId: string;
  workspaceId: string;
  subscriptionGroupId?: string;
}): Promise<{
  broadcast: BroadcastResource;
  segment: SavedSegmentResource;
  messageTemplate: MessageTemplateResource;
  journey: SavedJourneyResource;
}> {
  const segmentDefinition: SegmentDefinition = DEFAULT_SEGMENT_DEFINITION;
  const broadcastSegmentName = getBroadcastSegmentName({ broadcastId: id });
  const broadcastTemplateName = getBroadcastTemplateName({ broadcastId: id });
  const broadcastJourneyName = getBroadcastJourneyName({ broadcastId: id });
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
        definition: WELCOME_TEMPLATE,
      },
      update: {},
    }),
  ]);

  const journeyDefinition: JourneyDefinition = {
    entryNode: {
      type: JourneyNodeType.EntryNode,
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
      name: `Broadcast - ${id}`,
      segmentId: segment.id,
      journeyId: journey.id,
      messageTemplateId: messageTemplate.id,
    },
    update: {},
  });

  return {
    broadcast: toBroadcastResource(broadcast),
    journey: unwrap(toJourneyResource(journey)),
    messageTemplate: unwrap(enrichMessageTemplate(messageTemplate)),
    segment: unwrap(toSegmentResource(segment)),
  };
}

export async function getOrCreateBroadcast(params: {
  broadcastId: string;
  workspaceId: string;
}): Promise<BroadcastResources> {
  const broadcastResources = await getBroadcast(params);
  if (broadcastResources) {
    return broadcastResources;
  }
  return upsertBroadcast(params);
}
