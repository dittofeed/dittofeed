/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable no-await-in-loop */
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";

import { ClickHouseQueryBuilder, query as chQuery } from "../clickhouse";
import {
  getUserJourneyWorkflowId,
  segmentUpdateSignal,
  userJourneyWorkflow,
} from "../journeys/userWorkflow";
import logger from "../logger";
import prisma from "../prisma";
import { getContext } from "../temporal/activity";
import { JourneyDefinition, JourneyNodeType, SegmentUpdate } from "../types";

interface SegmentAssignment {
  user_id: string;
}

export async function restartUserJourneysActivity({
  workspaceId,
  journeyId,
  pageSize = 100,
}: {
  workspaceId: string;
  journeyId: string;
  pageSize?: number;
}) {
  let page: SegmentAssignment[] = [];
  let cursor: string | null = null;
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
  while (page.length >= pageSize || cursor === null) {
    const qb = new ClickHouseQueryBuilder();
    const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
    const segmentIdParam = qb.addQueryValue(segmentId, "String");
    const paginationClause =
      cursor === null
        ? ""
        : `AND user_id > ${qb.addQueryValue(cursor, "String")}`;

    // FIXME filter by assigned at after status change time
    const query = `
      SELECT user_id FROM computed_property_state_v2 
      WHERE 
        workspace_id = ${workspaceIdParam}
        AND type = 'segment'
        AND computed_property_id = ${segmentIdParam}
        ${paginationClause}
      LIMIT ${pageSize}
    `;
    const result = await chQuery({
      query,
    });
    page = await result.json<SegmentAssignment>();
    const newCursor = page[page.length - 1]?.user_id;
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
    const promises: Promise<unknown>[] = page.map(({ user_id }) => {
      const workflowId = getUserJourneyWorkflowId({
        journeyId,
        userId: user_id,
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
            userId: user_id,
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
