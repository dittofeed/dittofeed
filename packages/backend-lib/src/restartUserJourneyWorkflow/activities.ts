/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable no-await-in-loop */
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";

import {
  getUserJourneyWorkflowId,
  segmentUpdateSignal,
  userJourneyWorkflow,
} from "../journeys/userWorkflow";
import logger from "../logger";
import prisma from "../prisma";
import { findRecentlyUpdatedUsersInSegment } from "../segments";
import { getContext } from "../temporal/activity";
import { JourneyDefinition, JourneyNodeType, SegmentUpdate } from "../types";

export async function restartUserJourneysActivity({
  workspaceId,
  journeyId,
  pageSize = 100,
  statusUpdatedAt,
}: {
  workspaceId: string;
  journeyId: string;
  pageSize?: number;
  statusUpdatedAt: number;
}) {
  const journey = await prisma().journey.findUnique({
    where: {
      id: journeyId,
    },
    select: {
      definition: true,
    },
  });
  if (!journey) {
    logger().error(
      { journeyId, workspaceId },
      "Failed to find journey to restart user journeys",
    );
    return;
  }
  const { definition: unvalidatedDefinition } = journey;
  const definitionResult = schemaValidateWithErr(
    unvalidatedDefinition,
    JourneyDefinition,
  );
  if (definitionResult.isErr()) {
    logger().error(
      {
        journeyId,
        workspaceId,
        definition: unvalidatedDefinition,
        err: definitionResult.error,
      },
      "Failed to validate journey definition",
    );
    return;
  }
  const definition = definitionResult.value;
  if (definition.entryNode.type !== JourneyNodeType.SegmentEntryNode) {
    logger().info(
      {
        journeyId,
        workspaceId,
        entryNode: definition.entryNode,
      },
      "Journey is not a segment entry node, skipping",
    );
    return;
  }

  const segmentId = definition.entryNode.segment;

  let page: { userId: string }[] = [];
  let cursor: string | null = null;
  while (page.length >= pageSize || cursor === null) {
    page = await findRecentlyUpdatedUsersInSegment({
      workspaceId,
      cursor: cursor ?? undefined,
      assignedSince: statusUpdatedAt,
      segmentId,
      pageSize,
    });
    const newCursor = page[page.length - 1]?.userId;
    if (!newCursor) {
      break;
    }

    const { workflowClient } = getContext();
    const segmentUpdate: SegmentUpdate = {
      type: "segment",
      segmentId,
      currentlyInSegment: true,
      segmentVersion: Date.now(),
    };
    const promises: Promise<unknown>[] = page.map(({ userId }) => {
      const workflowId = getUserJourneyWorkflowId({
        journeyId,
        userId,
      });
      return workflowClient.signalWithStart<
        typeof userJourneyWorkflow,
        [SegmentUpdate]
      >(userJourneyWorkflow, {
        taskQueue: "default",
        workflowId,
        args: [
          {
            journeyId,
            definition,
            workspaceId,
            userId,
          },
        ],
        signal: segmentUpdateSignal,
        signalArgs: [segmentUpdate],
      });
    });
    await Promise.all(promises);

    cursor = newCursor;
  }
}
