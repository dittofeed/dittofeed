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
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";

import {
  ChannelType,
  DelayVariantType,
  JourneyDefinition,
  JourneyNode,
  JourneyNodeType,
  SegmentUpdate,
  WaitForNode,
} from "../types";
import * as activities from "./userWorkflow/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export const segmentUpdateSignal =
  wf.defineSignal<[SegmentUpdate]>("segmentUpdate");

const WORKFLOW_NAME = "userJourneyWorkflow";

const {
  sendEmail,
  getSegmentAssignment,
  onNodeProcessed,
  onNodeProcessedV2,
  isRunnable,
  sendMobilePush,
  sendSms,
  sendMessageV2,
  findNextLocalizedTime,
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
  let nextNode: JourneyNode | null = null;

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
      case JourneyNodeType.EntryNode: {
        const cn = currentNode;
        await wf.condition(() => segmentAssignedTrue(cn.segment));
        nextNode = nodes.get(currentNode.child) ?? null;
        if (!nextNode) {
          logger.error("missing entry node child", {
            ...defaultLoggingFields,
            child: currentNode.child,
          });
          nextNode = definition.exitNode;
          break;
        }
        break;
      }
      case JourneyNodeType.DelayNode: {
        let delay: number;
        switch (currentNode.variant.type) {
          case DelayVariantType.Second: {
            delay = currentNode.variant.seconds * 1000;
            break;
          }
          case DelayVariantType.LocalTime: {
            const now = Date.now();
            const nexTime = await findNextLocalizedTime({
              workspaceId,
              userId,
              now,
            });
            delay = nexTime - now;
            break;
          }
        }
        await sleep(delay);
        nextNode = nodes.get(currentNode.child) ?? null;
        if (!nextNode) {
          logger.error("missing delay node child", {
            ...defaultLoggingFields,
            child: currentNode.child,
          });
          nextNode = definition.exitNode;
          break;
        }
        break;
      }
      case JourneyNodeType.WaitForNode: {
        const cn: WaitForNode = currentNode;
        const { timeoutSeconds, segmentChildren } = cn;
        const satisfiedSegmentWithinTimeout = await wf.condition(
          () => segmentChildren.some((s) => segmentAssignedTrue(s.segmentId)),
          timeoutSeconds * 1000,
        );
        if (satisfiedSegmentWithinTimeout) {
          const child = segmentChildren.find((s) =>
            segmentAssignedTrue(s.segmentId),
          );
          if (!child) {
            logger.error("missing wait for segment child", {
              ...defaultLoggingFields,
              segmentChildren,
            });
            nextNode = definition.exitNode;
            break;
          }
          nextNode = nodes.get(child.id) ?? null;
          if (!nextNode) {
            logger.error("missing wait for segment child node", {
              ...defaultLoggingFields,
              child,
            });
            nextNode = definition.exitNode;
            break;
          }
        } else {
          nextNode = nodes.get(currentNode.timeoutChild) ?? null;
          if (!nextNode) {
            logger.error(
              "missing wait for timeout child node",
              defaultLoggingFields,
            );
            nextNode = definition.exitNode;
            break;
          }
        }
        break;
      }
      case JourneyNodeType.SegmentSplitNode: {
        const cn = currentNode;

        const segmentAssignment = await getSegmentAssignment({
          workspaceId,
          userId,
          segmentId: cn.variant.segment,
        });
        const nextNodeId: string = segmentAssignment?.inSegment
          ? currentNode.variant.trueChild
          : currentNode.variant.falseChild;

        if (!nextNodeId) {
          nextNode = definition.exitNode;
          break;
        }
        nextNode = nodes.get(nextNodeId) ?? null;

        if (!nextNode) {
          logger.error("missing segment split node child", {
            ...defaultLoggingFields,
            nextNodeId,
          });
          nextNode = definition.exitNode;
          break;
        }
        break;
      }
      case JourneyNodeType.MessageNode: {
        let shouldContinue: boolean;
        const messageId = uuid4();
        const messagePayload: activities.SendParams = {
          userId,
          workspaceId,
          journeyId,
          subscriptionGroupId: currentNode.subscriptionGroupId,
          runId,
          nodeId: currentNode.id,
          templateId: currentNode.variant.templateId,
          messageId,
        };

        if (wf.patched("send-message-v2")) {
          shouldContinue = await sendMessageV2({
            channel: currentNode.variant.type,
            ...messagePayload,
          });
        } else {
          switch (currentNode.variant.type) {
            case ChannelType.Email: {
              shouldContinue = await sendEmail(messagePayload);
              break;
            }
            case ChannelType.MobilePush: {
              shouldContinue = await sendMobilePush(messagePayload);
              break;
            }
            case ChannelType.Sms: {
              shouldContinue = await sendSms(messagePayload);
              break;
            }
            default: {
              const { type }: never = currentNode.variant;
              assertUnreachable(type, `unknown channel type ${type}`);
            }
          }
        }

        if (!shouldContinue) {
          logger.info("message node early exit", {
            ...defaultLoggingFields,
            child: currentNode.child,
          });
          nextNode = definition.exitNode;
          break;
        }

        nextNode = nodes.get(currentNode.child) ?? null;
        if (!nextNode) {
          logger.error("missing message node child", {
            ...defaultLoggingFields,
            child: currentNode.child,
          });
          nextNode = definition.exitNode;
          break;
        }
        break;
      }
      case JourneyNodeType.ExitNode: {
        break nodeLoop;
      }
      default:
        logger.error("unable to handle un-implemented node type", {
          ...defaultLoggingFields,
          nodeType: currentNode.type,
        });
        nextNode = definition.exitNode;
        break;
    }

    if (wf.patched("on-node-processed-v2")) {
      await onNodeProcessedV2({
        workspaceId,
        userId,
        node: currentNode,
        journeyStartedAt,
        journeyId,
      });
    } else {
      await onNodeProcessed({
        userId,
        node: currentNode,
        journeyStartedAt,
        journeyId,
      });
    }
    currentNode = nextNode;
  }
}
