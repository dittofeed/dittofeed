import { WorkflowNotFoundError } from "@temporalio/client";
import {
  EventEntryNode,
  JourneyDefinition,
  JourneyNodeType,
} from "isomorphic-lib/src/types";

import { getLinkedAnonymousIdsForKnownUser } from "../identityLinks";
import logger from "../logger";
import connectWorkflowClient from "../temporal/connectWorkflowClient";
import { UserWorkflowTrackEvent } from "../types";
import {
  getKeyedUserJourneyWorkflowId,
  getUserJourneyWorkflowId,
} from "./userWorkflow";

/**
 * If this known user was previously anonymous and already has a keyed journey
 * running under a linked anonymous id, skip starting the same journey again
 * under the known userId (avoids duplicate entry after identity resolution).
 */
export async function keyedJourneyRunningForLinkedAnonymous({
  workspaceId,
  knownUserId,
  journeyId,
  definition,
  event,
}: {
  workspaceId: string;
  knownUserId: string;
  journeyId: string;
  definition: JourneyDefinition;
  event: UserWorkflowTrackEvent;
}): Promise<boolean> {
  const { entryNode } = definition;
  if (entryNode.type !== JourneyNodeType.EventEntryNode) {
    return false;
  }
  const eventEntryNode: EventEntryNode = entryNode;
  let anonIds: string[];
  try {
    anonIds = await getLinkedAnonymousIdsForKnownUser(workspaceId, knownUserId);
  } catch (err) {
    logger().warn(
      { err, workspaceId, knownUserId },
      "identity link lookup failed; not deduping keyed journey start",
    );
    return false;
  }
  if (anonIds.length === 0) {
    return false;
  }
  let client: Awaited<ReturnType<typeof connectWorkflowClient>>;
  try {
    client = await connectWorkflowClient();
  } catch (err) {
    logger().warn(
      { err, workspaceId },
      "temporal client unavailable; not deduping keyed journey start",
    );
    return false;
  }

  const runningChecks = anonIds.map(async (anonId) => {
    const workflowId = getKeyedUserJourneyWorkflowId({
      workspaceId,
      userId: anonId,
      journeyId,
      event,
      entryNode: eventEntryNode,
    });
    if (!workflowId) {
      return false;
    }
    try {
      const handle = client.getHandle(workflowId);
      const desc = await handle.describe();
      return desc.status.name === "RUNNING";
    } catch (e: unknown) {
      if (e instanceof WorkflowNotFoundError) {
        return false;
      }
      throw e;
    }
  });

  try {
    const results = await Promise.all(runningChecks);
    return results.some(Boolean);
  } catch (err) {
    logger().warn(
      { err, workspaceId, journeyId },
      "keyed journey dedupe describe failed; allowing journey start",
    );
    return false;
  }
}

/**
 * Segment-entry journeys: if the user is known but a linked anonymous id still has the same
 * journey RUNNING, skip starting/signaling under the known userId (avoids duplicate segment
 * entry after alias). Full anonymous→known workflow handoff is a separate Temporal epic.
 */
export async function segmentEntryJourneyRunningForLinkedAnonymous({
  workspaceId,
  knownUserId,
  journeyId,
}: {
  workspaceId: string;
  knownUserId: string;
  journeyId: string;
}): Promise<boolean> {
  let anonIds: string[];
  try {
    anonIds = await getLinkedAnonymousIdsForKnownUser(workspaceId, knownUserId);
  } catch (err) {
    logger().warn(
      { err, workspaceId, knownUserId },
      "identity link lookup failed; not deduping segment-entry journey",
    );
    return false;
  }
  if (anonIds.length === 0) {
    return false;
  }
  let client: Awaited<ReturnType<typeof connectWorkflowClient>>;
  try {
    client = await connectWorkflowClient();
  } catch (err) {
    logger().warn(
      { err, workspaceId },
      "temporal client unavailable; not deduping segment-entry journey",
    );
    return false;
  }

  const runningChecks = anonIds.map(async (anonId) => {
    const workflowId = getUserJourneyWorkflowId({
      userId: anonId,
      journeyId,
    });
    try {
      const handle = client.getHandle(workflowId);
      const desc = await handle.describe();
      return desc.status.name === "RUNNING";
    } catch (e: unknown) {
      if (e instanceof WorkflowNotFoundError) {
        return false;
      }
      throw e;
    }
  });

  try {
    const results = await Promise.all(runningChecks);
    return results.some(Boolean);
  } catch (err) {
    logger().warn(
      { err, workspaceId, journeyId },
      "segment-entry journey dedupe describe failed; allowing signal",
    );
    return false;
  }
}
