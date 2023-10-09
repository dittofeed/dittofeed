import { Broadcast } from "@prisma/client";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  BroadcastResource,
  ChannelType,
  EmailTemplateResource,
  JourneyDefinition,
  JourneyNodeType,
  JourneyResource,
  MessageTemplateResource,
  SegmentDefinition,
  SegmentNodeType,
  SegmentResource,
} from "isomorphic-lib/src/types";

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
    triggeredAt: broadcast.triggeredAt
      ? broadcast.triggeredAt.getTime()
      : undefined,
    createdAt: broadcast.createdAt.getTime(),
  };
  return resource;
}

export interface BroadcastResources {
  broadcast: BroadcastResource;
  segment: SegmentResource;
  messageTemplate: MessageTemplateResource;
  journey: JourneyResource;
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
  segment: SegmentResource;
  messageTemplate: MessageTemplateResource;
  journey: JourneyResource;
}> {
  const segmentDefinition: SegmentDefinition = {
    entryNode: {
      type: SegmentNodeType.Broadcast,
      id: "segment-broadcast-entry",
    },
    nodes: [],
  };
  const templateDefinition: EmailTemplateResource = {
    type: ChannelType.Email,
    subject: "",
    from: "",
    body: "",
  };

  const broadcastSegmentName = getBroadcastSegmentName({ broadcastId: id });
  const broadcastTemplateName = getBroadcastTemplateName({ broadcastId: id });
  const broadcastJourneyName = getBroadcastJourneyName({ broadcastId: id });
  const [broadcast, segment, messageTemplate] = await Promise.all([
    prisma().broadcast.upsert({
      where: {
        id,
      },
      create: {
        id,
        workspaceId,
        name: `Broadcast - ${id}`,
      },
      update: {},
    }),
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
        definition: templateDefinition,
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
    },
    update: {},
  });
  return {
    broadcast: toBroadcastResource(broadcast),
    journey: unwrap(toJourneyResource(journey)),
    messageTemplate: {
      ...messageTemplate,
      definition: templateDefinition,
    },
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
