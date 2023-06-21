/* eslint-disable no-await-in-loop */
import {
  LoggerSinks,
  proxyActivities,
  proxySinks,
  sleep,
  uuid4,
  workflowInfo,
} from "@temporalio/workflow";
import * as wf from "@temporalio/workflow";

import {
  DelayVariantType,
  JourneyDefinition,
  JourneyNode,
  MessageNodeVariantType,
  SegmentUpdate,
} from "../types";
import type * as activities from "./userWorkflow/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export const segmentUpdateSignal =
  wf.defineSignal<[SegmentUpdate]>("segmentUpdate");

const {
  sendEmail,
  getSegmentAssignment,
  onNodeProcessed,
  isRunnable,
  sendMobilePush,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
});

type SegmentAssignment = Pick<
  SegmentUpdate,
  "currentlyInSegment" | "segmentVersion"
>;

export async function userJourneyWorkflow({
  workspaceId,
  userId,
  definition,
  journeyId,
}: {
  journeyId: string;
  workspaceId: string;
  definition: JourneyDefinition;
  userId: string;
}): Promise<void> {
  // TODO write end to end test
  if (!(await isRunnable({ journeyId, userId }))) {
    logger.info("early exit unrunnable user journey", {});
    return;
  }

  const journeyStartedAt = Date.now();
  const segmentAssignments = new Map<string, SegmentAssignment>();
  const nodes = new Map<string, JourneyNode>();
  const { runId } = workflowInfo();

  for (const node of definition.nodes) {
    nodes.set(node.id, node);
  }
  nodes.set(definition.exitNode.type, definition.exitNode);

  wf.setHandler(segmentUpdateSignal, (update) => {
    const prev = segmentAssignments.get(update.segmentId);
    if (prev && prev.segmentVersion >= update.segmentVersion) {
      return;
    }

    segmentAssignments.set(update.segmentId, {
      currentlyInSegment: update.currentlyInSegment,
      segmentVersion: update.segmentVersion,
    });
  });

  let currentNode: JourneyNode = definition.entryNode;

  // loop with finite length as a safety stopgap
  nodeLoop: for (let i = 0; i < nodes.size + 1; i++) {
    logger.info("user journey node", {
      type: currentNode.type,
    });
    switch (currentNode.type) {
      case "EntryNode": {
        const cn = currentNode;
        await wf.condition(
          () => segmentAssignments.get(cn.segment)?.currentlyInSegment === true
        );

        await onNodeProcessed({
          userId,
          node: currentNode,
          journeyStartedAt,
          journeyId,
        });

        const nextNode = nodes.get(currentNode.child);
        if (!nextNode) {
          logger.error("missing entry node child", {
            child: currentNode.child,
          });
          currentNode = definition.exitNode;
          break;
        }
        currentNode = nextNode;
        break;
      }
      case "DelayNode": {
        let delay: string | number;
        switch (currentNode.variant.type) {
          case DelayVariantType.Second: {
            delay = currentNode.variant.seconds * 1000;
            break;
          }
        }
        await sleep(delay);
        await onNodeProcessed({
          userId,
          node: currentNode,
          journeyStartedAt,
          journeyId,
        });

        const nextNode = nodes.get(currentNode.child);
        if (!nextNode) {
          logger.error("missing delay node child", {
            child: currentNode.child,
          });
          currentNode = definition.exitNode;
          break;
        }
        currentNode = nextNode;
        break;
      }
      case "SegmentSplitNode": {
        const cn = currentNode;

        // TODO read from map if available
        const segmentAssignment = await getSegmentAssignment({
          workspaceId,
          userId,
          segmentId: cn.variant.segment,
        });
        await onNodeProcessed({
          userId,
          node: currentNode,
          journeyStartedAt,
          journeyId,
        });

        const nextNodeId = segmentAssignment?.inSegment
          ? currentNode.variant.trueChild
          : currentNode.variant.falseChild;

        if (!nextNodeId) {
          currentNode = definition.exitNode;
          break;
        }
        const nextNode = nodes.get(nextNodeId);

        if (!nextNode) {
          logger.error("missing segment split node child", { nextNodeId });
          currentNode = definition.exitNode;
          break;
        }
        currentNode = nextNode;
        break;
      }
      case "MessageNode": {
        let shouldContinue: boolean;
        const messageId = uuid4();
        switch (currentNode.variant.type) {
          case MessageNodeVariantType.Email: {
            shouldContinue = await sendEmail({
              userId,
              workspaceId,
              journeyId,
              subscriptionGroupId: currentNode.subscriptionGroupId,
              runId,
              nodeId: currentNode.id,
              templateId: currentNode.variant.templateId,
              messageId,
            });
            break;
          }
          case MessageNodeVariantType.MobilePush: {
            shouldContinue = await sendMobilePush({
              userId,
              workspaceId,
              journeyId,
              subscriptionGroupId: currentNode.subscriptionGroupId,
              runId,
              nodeId: currentNode.id,
              templateId: currentNode.variant.templateId,
              messageId,
            });
            break;
          }
        }

        await onNodeProcessed({
          userId,
          node: currentNode,
          journeyStartedAt,
          journeyId,
        });

        if (!shouldContinue) {
          logger.info("message node early exit", {
            child: currentNode.child,
          });
          currentNode = definition.exitNode;
          break;
        }

        const nextNode = nodes.get(currentNode.child);
        if (!nextNode) {
          logger.error("missing message node child", {
            child: currentNode.child,
          });
          currentNode = definition.exitNode;
          break;
        }
        currentNode = nextNode;

        break;
      }
      case "ExitNode": {
        await onNodeProcessed({
          userId,
          node: currentNode,
          journeyStartedAt,
          journeyId,
        });
        break nodeLoop;
      }
      default:
        logger.error("unable to handle un-implemented node type", {
          nodeType: currentNode.type,
        });
        currentNode = definition.exitNode;
        break;
    }
  }
}
