import { Prisma } from "@prisma/client";
import { getNodeId } from "isomorphic-lib/src/journeys";
import { v5 as uuidv5 } from "uuid";

import { submitTrack } from "../apps/track";
import prisma from "../prisma";
import { InternalEventType, JourneyNode } from "../types";

export async function recordNodeProcessed({
  journeyStartedAt,
  userId,
  node,
  journeyId,
  workspaceId,
  eventKey,
}: RecordNodeProcessedParams) {
  const journeyStartedAtDate = new Date(journeyStartedAt);
  const nodeId = getNodeId(node);

  const messageIdName = [
    journeyStartedAt,
    journeyId,
    userId,
    node.type,
    nodeId,
  ].join("-");

  const trackedFields: Omit<Prisma.UserJourneyEventCreateManyInput, "userId"> =
    {
      journeyStartedAt: journeyStartedAtDate,
      journeyId,
      type: node.type,
      nodeId,
      eventKey,
    };
  await Promise.all([
    prisma().userJourneyEvent.createMany({
      data: [
        {
          ...trackedFields,
          userId,
        },
      ],
      skipDuplicates: true,
    }),
    submitTrack({
      workspaceId,
      data: {
        userId,
        event: InternalEventType.JourneyNodeProcessed,
        messageId: uuidv5(messageIdName, workspaceId),
        properties: trackedFields,
      },
    }),
  ]);
}
export interface RecordNodeProcessedParams {
  journeyStartedAt: number;
  journeyId: string;
  userId: string;
  node: JourneyNode;
  workspaceId: string;
  eventKey?: string;
}
