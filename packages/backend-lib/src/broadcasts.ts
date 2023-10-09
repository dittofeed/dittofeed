import {
  BroadcastResource,
  ChannelType,
  EmailTemplateResource,
  JourneyDefinition,
  JourneyNodeType,
  MessageTemplateResource,
  SegmentDefinition,
  SegmentNodeType,
  SegmentResource,
} from "isomorphic-lib/src/types";

import prisma from "./prisma";

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

export async function createBroadcast({
  workspaceId,
  broadcastId: id,
  subscriptionGroupId,
}: {
  broadcastId: string;
  workspaceId: string;
  subscriptionGroupId: string;
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

  await prisma().journey.upsert({
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
}
