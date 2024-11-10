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
import { omit } from "remeda";

import { jsonValue } from "../jsonPath";
import { retryExponential } from "../retry";
import { assertUnreachableSafe } from "../typeAssertions";
import {
  ChannelType,
  DelayVariantType,
  JourneyDefinition,
  JourneyNode,
  JourneyNodeType,
  JSONValue,
  MessageVariant,
  RenameKey,
  SegmentUpdate,
  UserWorkflowTrackEvent,
  WaitForNode,
  WaitForSegmentChild,
} from "../types";
import * as activities from "./userWorkflow/activities";
import { GetSegmentAssignmentVersion } from "./userWorkflow/types";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export const segmentUpdateSignal =
  wf.defineSignal<[SegmentUpdate]>("segmentUpdate");

export const trackSignal = wf.defineSignal<[UserWorkflowTrackEvent]>("track");

const WORKFLOW_NAME = "userJourneyWorkflow";

const {
  getSegmentAssignment,
  onNodeProcessedV2,
  isRunnable,
  sendMessageV2,
  findNextLocalizedTime,
  getEarliestComputePropertyPeriod,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
});

type SegmentAssignment = Pick<
  SegmentUpdate,
  "currentlyInSegment" | "segmentVersion"
>;

export function getUserJourneyWorkflowId({
  userId,
  journeyId,
  eventKey,
}: {
  userId: string;
  journeyId: string;
} & (
  | {
      eventKey?: string;
    }
  | {
      eventKeyName: string;
      eventKey: string;
    }
)): string {
  return [`user-journey-${userId}-${journeyId}`, eventKey]
    .filter(Boolean)
    .join("-");
}

export enum UserJourneyWorkflowVersion {
  V1 = 1,
  V2 = 2,
}

export interface UserJourneyWorkflowPropsV2 {
  version: UserJourneyWorkflowVersion.V2;
  workspaceId: string;
  userId: string;
  definition: JourneyDefinition;
  journeyId: string;
  event?: UserWorkflowTrackEvent;
}

export interface UserJourneyWorkflowPropsV1 {
  workspaceId: string;
  userId: string;
  definition: JourneyDefinition;
  journeyId: string;
  eventKey?: string;
  context?: Record<string, JSONValue>;
  version?: UserJourneyWorkflowVersion.V1;
}

export type UserJourneyWorkflowProps =
  | UserJourneyWorkflowPropsV1
  | UserJourneyWorkflowPropsV2;

export async function userJourneyWorkflow(
  props: UserJourneyWorkflowProps,
): Promise<void> {
  logger.debug("userJourneyWorkflow", { props });
  const { workspaceId, userId, definition, journeyId } = props;
  const entryEventProperties =
    props.version === UserJourneyWorkflowVersion.V2
      ? props.event?.properties
      : props.context;
  const eventKeyName =
    props.definition.entryNode.type === JourneyNodeType.EventEntryNode
      ? props.definition.entryNode.key
      : undefined;

  let eventKey: string | undefined;
  if (props.version === UserJourneyWorkflowVersion.V2) {
    if (props.event) {
      if (eventKeyName) {
        logger.debug("event key from name", {
          eventKeyName,
          event: props.event,
        });
        const keyValueFromProps = jsonValue({
          data: props.event.properties,
          path: eventKeyName,
        });
        if (
          keyValueFromProps.isOk() &&
          typeof keyValueFromProps.value === "string"
        ) {
          eventKey = keyValueFromProps.value;
        }
      } else {
        eventKey = props.event.messageId;
      }
    }
  } else {
    eventKey = props.eventKey;
  }

  if (!(await isRunnable({ journeyId, userId, eventKey, eventKeyName }))) {
    logger.info("early exit unrunnable user journey", {
      workflow: WORKFLOW_NAME,
      journeyId,
      userId,
      workspaceId,
      entryEventProperties,
    });
    return;
  }

  const keyedEvents: UserWorkflowTrackEvent[] = [];
  if (props.version === UserJourneyWorkflowVersion.V2 && props.event) {
    keyedEvents.push(props.event);
  }

  // event entry journeys can't be started from segment signals
  if (
    definition.entryNode.type === JourneyNodeType.EventEntryNode &&
    !eventKey
  ) {
    logger.info("early exit event key missing for event entry", {
      journeyId,
      userId,
      event: definition.entryNode.event,
      workspaceId,
      eventKey,
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
  let waitForSegmentIds: WaitForSegmentChild[] | null = null;

  wf.setHandler(trackSignal, async (event) => {
    logger.info("keyed event signal", {
      workspaceId,
      journeyId,
      userId,
      messageId: event.messageId,
    });
    keyedEvents.push(event);
    if (!waitForSegmentIds) {
      logger.debug("no wait for segments, skipping", {
        workflow: WORKFLOW_NAME,
        journeyId,
        userId,
        workspaceId,
      });
      return;
    }
    await Promise.all(
      waitForSegmentIds.map(async ({ segmentId }) => {
        const nowMs = Date.now();
        // FIXME null
        const assignment = await getSegmentAssignment({
          workspaceId,
          userId,
          segmentId,
          events: keyedEvents,
          keyValue: event.messageId,
          nowMs,
        });
        logger.debug("segment assignment from keyed event", {
          workspaceId,
          userId,
          segmentId,
          assignment,
          event,
        });
        if (assignment === null) {
          return;
        }
        segmentAssignments.set(segmentId, {
          currentlyInSegment: assignment.inSegment,
          segmentVersion: nowMs,
        });
      }),
    );
  });

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

  // FIXME check if segment was assigned true prior to start of journey
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
      eventKey,
    };
    logger.info("user journey node", {
      ...defaultLoggingFields,
      type: currentNode.type,
    });
    switch (currentNode.type) {
      case JourneyNodeType.SegmentEntryNode: {
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
      case JourneyNodeType.EventEntryNode: {
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
        waitForSegmentIds = segmentChildren;
        const satisfiedSegmentWithinTimeout = await wf.condition(
          () => segmentChildren.some((s) => segmentAssignedTrue(s.segmentId)),
          timeoutSeconds * 1000,
        );
        waitForSegmentIds = null;
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
          events: keyedEvents,
          keyValue: eventKey,
          nowMs: Date.now(),
          version: GetSegmentAssignmentVersion.V1,
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
        const messageId = uuid4();
        const messagePayload: Omit<activities.SendParams, "templateId"> = {
          userId,
          workspaceId,
          journeyId,
          subscriptionGroupId: currentNode.subscriptionGroupId,
          runId,
          nodeId: currentNode.id,
          messageId,
        };

        let variant: RenameKey<MessageVariant, "type", "channel">;
        switch (currentNode.variant.type) {
          case ChannelType.Email: {
            variant = {
              ...omit(currentNode.variant, ["type"]),
              channel: currentNode.variant.type,
            };
            break;
          }
          case ChannelType.Sms: {
            variant = {
              ...omit(currentNode.variant, ["type"]),
              channel: currentNode.variant.type,
            };
            break;
          }
          case ChannelType.Webhook: {
            variant = {
              ...omit(currentNode.variant, ["type"]),
              channel: currentNode.variant.type,
            };
            break;
          }
          case ChannelType.MobilePush: {
            variant = {
              ...omit(currentNode.variant, ["type"]),
              channel: currentNode.variant.type,
            };
            break;
          }
        }

        const shouldContinue = await sendMessageV2({
          context: entryEventProperties,
          ...messagePayload,
          ...variant,
        });

        if (!shouldContinue) {
          logger.info("message node early exit", {
            ...defaultLoggingFields,
            child: currentNode.child,
          });
          nextNode = definition.exitNode;
          break;
        }

        if (currentNode.syncProperties) {
          const now = Date.now();

          // retry until compute properties workflow as run after message was sent
          const succeeded = await retryExponential({
            sleep,
            check: async () => {
              const period = await getEarliestComputePropertyPeriod({
                workspaceId,
              });
              logger.debug("retrying until compute properties are updated", {
                period,
                now,
                workspaceId,
                userId,
              });
              return period > now;
            },
            logger,
            baseDelay: 10000,
            maxAttempts: 5,
          });

          if (!succeeded) {
            logger.error(
              "compute properties did not sync within timeout",
              defaultLoggingFields,
            );
            nextNode = definition.exitNode;
            break;
          }
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
      case JourneyNodeType.ExperimentSplitNode: {
        logger.error("unable to handle un-implemented node type", {
          ...defaultLoggingFields,
          nodeType: currentNode.type,
        });
        nextNode = definition.exitNode;
        break;
      }
      case JourneyNodeType.RateLimitNode: {
        logger.error("unable to handle un-implemented node type", {
          ...defaultLoggingFields,
          nodeType: currentNode.type,
        });
        nextNode = definition.exitNode;
        break;
      }
      default:
        logger.error("unable to handle un-implemented node type", {
          ...defaultLoggingFields,
          nodeType: currentNode,
        });
        nextNode = definition.exitNode;
        assertUnreachableSafe(currentNode, "un-implemented node type");
        break;
    }

    await onNodeProcessedV2({
      workspaceId,
      userId,
      node: currentNode,
      journeyStartedAt,
      journeyId,
      eventKey,
      eventKeyName,
    });
    currentNode = nextNode;
  }

  await onNodeProcessedV2({
    workspaceId,
    userId,
    node: definition.exitNode,
    journeyStartedAt,
    journeyId,
    eventKey,
    eventKeyName,
  });
}
