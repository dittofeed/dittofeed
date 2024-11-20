import { Broadcast } from "@prisma/client";
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

import { toJourneyResource } from "./journeys";
import logger from "./logger";
import { enrichMessageTemplate } from "./messaging";
import { defaultEmailDefinition } from "./messaging/email";
import prisma from "./prisma";
import { toSegmentResource } from "./segments";
import { broadcastWorkflow } from "./segments/broadcastWorkflow";
import connectWorkflowClient from "./temporal/connectWorkflowClient";
import { isAlreadyStartedError } from "./temporal/workflow";
import { generateBroadcastWorkflowId } from "./temporal/workflows";

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
    const defaultEmailProvider = await prisma().defaultEmailProvider.findUnique(
      {
        where: {
          workspaceId,
        },
      },
    );
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
        definition: messageTemplateDefinition,
      },
      update: {},
    }),
    sgId
      ? null
      : prisma().subscriptionGroup.findFirst({
          where: {
            workspaceId,
            channel: mDefinition?.type ?? ChannelType.Email,
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
          },
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
