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
  ChannelType,
  DelayVariantType,
  JourneyDefinition,
  JourneyNode,
  SegmentUpdate,
} from "../types";
import type * as activities from "./userWorkflow/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export const segmentUpdateSignal =
  wf.defineSignal<[SegmentUpdate]>("segmentUpdate");

const WORKFLOW_NAME = "userJourneyWorkflow";

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
    logger.info("early exit unrunnable user journey", {
      workflow: WORKFLOW_NAME,
      journeyId,
      userId,
      workspaceId,
    });
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
    const loggerAttrs = {
      workflow: WORKFLOW_NAME,
      journeyId,
      userId,
      workspaceId,
      prev,
      update,
    };
    if (prev && prev.segmentVersion >= update.segmentVersion) {
      logger.info("ignoring stale segment update", loggerAttrs);
      return;
    }

    logger.info("segment update", loggerAttrs);
    segmentAssignments.set(update.segmentId, {
      currentlyInSegment: update.currentlyInSegment,
      segmentVersion: update.segmentVersion,
    });
  });

  let currentNode: JourneyNode = definition.entryNode;

  function segmentAssignedTrue(segmentId: string): boolean {
    return segmentAssignments.get(segmentId)?.currentlyInSegment === true;
  }

  // loop with finite length as a safety stopgap
  nodeLoop: for (let i = 0; i < nodes.size + 1; i++) {
    const defaultLoggingFields = {
      workflow: WORKFLOW_NAME,
      type: currentNode.type,
      workspaceId,
      journeyId,
      userId,
      runId,
      currentNode,
    };
    logger.info("user journey node", {
      ...defaultLoggingFields,
      type: currentNode.type,
    });
    switch (currentNode.type) {
      case "EntryNode": {
        const cn = currentNode;
        await wf.condition(() => segmentAssignedTrue(cn.segment));

        await onNodeProcessed({
          userId,
          node: currentNode,
          journeyStartedAt,
          journeyId,
        });

        const nextNode = nodes.get(currentNode.child);
        if (!nextNode) {
          logger.error("missing entry node child", {
            ...defaultLoggingFields,
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
            ...defaultLoggingFields,
            child: currentNode.child,
          });
          currentNode = definition.exitNode;
          break;
        }
        currentNode = nextNode;
        break;
      }
      case "WaitForNode": {
        const { segmentChildren, timeoutSeconds } = currentNode;
        const satisfiedSegmentWithinTimeout = await wf.condition(
          () => segmentChildren.some((s) => segmentAssignedTrue(s.segmentId)),
          timeoutSeconds * 1000
        );
        if (satisfiedSegmentWithinTimeout) {
          const child = segmentChildren.find((s) =>
            segmentAssignedTrue(s.segmentId)
          );
          if (!child) {
            logger.error("missing wait for segment child", {
              ...defaultLoggingFields,
              segmentChildren,
            });
            currentNode = definition.exitNode;
            break;
          }
          const nextNode = nodes.get(child.id);
          if (!nextNode) {
            logger.error("missing wait for segment child node", {
              ...defaultLoggingFields,
              child,
            });
            currentNode = definition.exitNode;
            break;
          }
          currentNode = nextNode;
        } else {
          const nextNode = nodes.get(currentNode.timeoutChild);
          if (!nextNode) {
            logger.error(
              "missing wait for timeout child node",
              defaultLoggingFields
            );
            currentNode = definition.exitNode;
            break;
          }
          currentNode = nextNode;
        }
        break;
      }
      case "SegmentSplitNode": {
        const cn = currentNode;

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
          logger.error("missing segment split node child", {
            ...defaultLoggingFields,
            nextNodeId,
          });
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
          case ChannelType.Email: {
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
          case ChannelType.MobilePush: {
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
            ...defaultLoggingFields,
            child: currentNode.child,
          });
          currentNode = definition.exitNode;
          break;
        }

        const nextNode = nodes.get(currentNode.child);
        if (!nextNode) {
          logger.error("missing message node child", {
            ...defaultLoggingFields,
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
          ...defaultLoggingFields,
          nodeType: currentNode.type,
        });
        currentNode = definition.exitNode;
        break;
    }
  }
}
