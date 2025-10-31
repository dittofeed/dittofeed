/* eslint-disable no-await-in-loop */
import {
  continueAsNew,
  LoggerSinks,
  proxyActivities,
  proxySinks,
  sleep,
  uuid4,
  workflowInfo,
} from "@temporalio/workflow";
import * as wf from "@temporalio/workflow";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { omit } from "remeda";
import { v5 as uuidV5 } from "uuid";

import {
  GetUserPropertyDelayParams,
  GetUserPropertyDelayParamsV1,
  GetUserPropertyDelayParamsV2,
} from "../dates";
import { jsonStringOrNumber, jsonValue } from "../jsonPath";
import { retryExponential } from "../retry";
import { assertUnreachableSafe } from "../typeAssertions";
import {
  ChannelType,
  DelayVariantType,
  EventEntryNode,
  JourneyDefinition,
  JourneyNode,
  JourneyNodeType,
  JSONValue,
  MessageVariant,
  RandomCohortNode,
  RenameKey,
  SegmentAssignment,
  SegmentAssignment as SegmentAssignmentDb,
  SegmentUpdate,
  SmsMessageVariant,
  SmsProviderOverride,
  SmsProviderType,
  UserWorkflowTrackEvent,
  WaitForNode,
  WaitForSegmentChild,
} from "../types";
import * as activities from "./userWorkflow/activities";
import { SendParamsV2 } from "./userWorkflow/activities";
import { GetSegmentAssignmentVersion } from "./userWorkflow/types";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export const segmentUpdateSignal =
  wf.defineSignal<[SegmentUpdate]>("segmentUpdate");

export interface ReEvaluateSegmentsParams {
  segmentIds?: string[];
}

export const reEvaluateSegmentsSignal =
  wf.defineSignal<[ReEvaluateSegmentsParams]>("reEvaluateSegments");

export enum TrackSignalParamsVersion {
  V1 = 1,
  V2 = 2,
}

export type TrackSignalParamsV1 = UserWorkflowTrackEvent & {
  version?: TrackSignalParamsVersion.V1;
};

export interface TrackSignalParamsV2 {
  version: TrackSignalParamsVersion.V2;
  messageId: string;
}

export type TrackSignalParams = TrackSignalParamsV1 | TrackSignalParamsV2;

export const trackSignal = wf.defineSignal<[TrackSignalParams]>("track");

const WORKFLOW_NAME = "userJourneyWorkflow";

const {
  onNodeProcessedV2,
  isRunnable,
  findNextLocalizedTime,
  findNextLocalizedTimeV2,
  getEarliestComputePropertyPeriod,
  getUserPropertyDelay,
  getWorkspace,
  shouldReEnter,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
});

const { getEventsById, getSegmentAssignment } = wf.proxyLocalActivities<
  typeof activities
>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 10,
  },
});

const { getRandomNumber } = wf.proxyLocalActivities<typeof activities>({
  startToCloseTimeout: "5 seconds",
});

const { reportWorkflowInfo } = wf.proxyLocalActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
});

type ReceivedSegmentUpdate = Pick<
  SegmentUpdate,
  "currentlyInSegment" | "segmentVersion"
>;

export function getKeyedUserJourneyWorkflowIdInner({
  workspaceId,
  userId,
  journeyId,
  eventKey,
  eventKeyValue,
}: {
  workspaceId: string;
  userId: string;
  journeyId: string;
  eventKey: string;
  eventKeyValue: string;
}): string | null {
  const combined = uuidV5(
    [userId, eventKey, eventKeyValue].join("-"),
    workspaceId,
  );
  return `user-journey-keyed-${workspaceId}-${journeyId}-${combined}`;
}

export function getKeyedUserJourneyWorkflowId({
  workspaceId,
  userId,
  journeyId,
  entryNode,
  event,
}: {
  workspaceId: string;
  userId: string;
  journeyId: string;
  entryNode: EventEntryNode;
  event: UserWorkflowTrackEvent;
}): string | null {
  let key: string;
  let keyValue: string;
  if (entryNode.key) {
    key = entryNode.key;
    const keyValueResult = jsonStringOrNumber({
      data: event.properties,
      path: key,
    })
      .map(String)
      .unwrapOr(null);
    if (!keyValueResult) {
      return null;
    }
    keyValue = keyValueResult;
  } else {
    key = "messageId";
    keyValue = event.messageId;
  }
  return getKeyedUserJourneyWorkflowIdInner({
    workspaceId,
    userId,
    journeyId,
    eventKey: key,
    eventKeyValue: keyValue,
  });
}

export function getUserJourneyWorkflowId({
  userId,
  journeyId,
}: {
  userId: string;
  journeyId: string;
}): string {
  return `user-journey-${userId}-${journeyId}`;
}

export const UserJourneyWorkflowVersion = {
  V1: 1,
  V2: 2,
  V3: 3,
} as const;

export interface UserJourneyWorkflowPropsV3 {
  version: typeof UserJourneyWorkflowVersion.V3;
  workspaceId: string;
  userId: string;
  definition: JourneyDefinition;
  journeyId: string;
  eventKey?: string;
  messageId: string;
  hidden?: boolean;
  shouldContinueAsNew?: boolean;
}

export interface UserJourneyWorkflowPropsV2 {
  version: typeof UserJourneyWorkflowVersion.V2;
  workspaceId: string;
  userId: string;
  definition: JourneyDefinition;
  journeyId: string;
  event?: UserWorkflowTrackEvent;
  shouldContinueAsNew?: boolean;
}

export interface UserJourneyWorkflowPropsV1 {
  workspaceId: string;
  userId: string;
  definition: JourneyDefinition;
  journeyId: string;
  eventKey?: string;
  context?: Record<string, JSONValue>;
  version?: typeof UserJourneyWorkflowVersion.V1;
  shouldContinueAsNew?: boolean;
}

export type UserJourneyWorkflowProps =
  | UserJourneyWorkflowPropsV1
  | UserJourneyWorkflowPropsV2
  | UserJourneyWorkflowPropsV3;

const LONG_RUNNING_NODE_TYPES = new Set<JourneyNodeType>([
  JourneyNodeType.WaitForNode,
  JourneyNodeType.DelayNode,
  JourneyNodeType.SegmentEntryNode,
]);

export async function userJourneyWorkflow(
  props: UserJourneyWorkflowProps,
): Promise<UserJourneyWorkflowProps | null> {
  const {
    workspaceId,
    userId,
    definition,
    journeyId,
    shouldContinueAsNew = true,
  } = props;

  let entryEventProperties: Record<string, JSONValue> | undefined;
  let isHidden: boolean;
  let eventKey: string | undefined;

  const eventKeyName =
    props.definition.entryNode.type === JourneyNodeType.EventEntryNode
      ? props.definition.entryNode.key
      : undefined;

  switch (props.version) {
    case UserJourneyWorkflowVersion.V3: {
      // not setting entry event properties for v3
      isHidden = props.hidden ?? false;
      eventKey = props.eventKey ?? props.messageId;
      break;
    }
    case UserJourneyWorkflowVersion.V2: {
      entryEventProperties = props.event?.properties;
      isHidden = props.event?.context?.hidden === true;
      if (props.event) {
        if (eventKeyName) {
          const keyValueFromProps = jsonValue({
            data: props.event.properties,
            path: eventKeyName,
          });
          if (
            keyValueFromProps.isOk() &&
            (typeof keyValueFromProps.value === "string" ||
              typeof keyValueFromProps.value === "number")
          ) {
            eventKey = keyValueFromProps.value.toString();
          } else {
            logger.error("event key value not found", {
              journeyId,
              userId,
              workspaceId,
              messageId: props.event.messageId,
            });
            return null;
          }
        } else {
          eventKey = props.event.messageId;
        }
      }
      break;
    }
    case UserJourneyWorkflowVersion.V1:
    default: {
      entryEventProperties = props.context;
      isHidden = false;
      eventKey = props.eventKey;
      break;
    }
  }

  if (
    !(await isRunnable({
      journeyId,
      userId,
      eventKey,
      eventKeyName,
      workspaceId,
    }))
  ) {
    logger.info("early exit unrunnable user journey", {
      workflow: WORKFLOW_NAME,
      journeyId,
      userId,
      workspaceId,
      entryEventProperties,
    });
    return null;
  }

  // deprecated because inflates the size of the workflow state
  let keyedEvents: UserWorkflowTrackEvent[] | undefined;
  const keyedEventIds = new Set<string>();
  switch (props.version) {
    case UserJourneyWorkflowVersion.V3: {
      keyedEventIds.add(props.messageId);
      break;
    }
    case UserJourneyWorkflowVersion.V2: {
      if (props.event) {
        keyedEvents = [props.event];
        keyedEventIds.add(props.event.messageId);
      }
      break;
    }
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
    return null;
  }

  const journeyStartedAt = Date.now();
  const segmentAssignments = new Map<string, ReceivedSegmentUpdate>();
  const nodes = new Map<string, JourneyNode>();
  const { runId } = workflowInfo();

  function reportWorkflowInfoHandler() {
    if (wf.patched("workflow-history-metrics")) {
      const info = workflowInfo();
      void reportWorkflowInfo({
        historySize: info.historySize,
        historyLength: info.historyLength,
        workspaceId,
        journeyId,
      });
    }
  }

  for (const node of definition.nodes) {
    nodes.set(node.id, node);
  }
  nodes.set(definition.exitNode.type, definition.exitNode);
  let waitForSegmentIds: WaitForSegmentChild[] | null = null;

  async function getSegmentAssignmentHandler({
    segmentId,
    now: nowInner,
  }: {
    segmentId: string;
    now: number;
  }): Promise<SegmentAssignment | null> {
    if (eventKey) {
      // deprecated, now passing by id rather than by value
      if (keyedEvents) {
        return getSegmentAssignment({
          workspaceId,
          userId,
          segmentId,
          events: keyedEvents,
          keyValue: eventKey,
          nowMs: nowInner,
          version: GetSegmentAssignmentVersion.V1,
        });
      }
      return getSegmentAssignment({
        workspaceId,
        userId,
        segmentId,
        eventIds: Array.from(keyedEventIds),
        keyValue: eventKey,
        nowMs: nowInner,
        version: GetSegmentAssignmentVersion.V2,
      });
    }

    return getSegmentAssignment({
      workspaceId,
      userId,
      segmentId,
    });
  }

  wf.setHandler(trackSignal, async (event) => {
    logger.info("keyed event signal", {
      workspaceId,
      journeyId,
      userId,
      messageId: event.messageId,
    });
    if (keyedEventIds.has(event.messageId)) {
      logger.info("ignoring duplicate keyed event", {
        journeyId,
        userId,
        workspaceId,
        messageId: event.messageId,
      });
      return;
    }
    switch (event.version) {
      case TrackSignalParamsVersion.V2: {
        const propsVersion = props.version ?? UserJourneyWorkflowVersion.V1;
        if (propsVersion !== UserJourneyWorkflowVersion.V3) {
          if (!Array.isArray(keyedEvents)) {
            logger.error(
              "keyed events not set on a workflow version that expects it to be",
              {
                journeyId,
                userId,
                workspaceId,
                event,
                propsVersion,
              },
            );
            return;
          }

          const newEvents = await getEventsById({
            workspaceId,
            eventIds: [event.messageId],
          });
          if (Array.isArray(keyedEvents)) {
            keyedEvents.push(...newEvents);
          }
        }

        keyedEventIds.add(event.messageId);
        break;
      }
      case TrackSignalParamsVersion.V1:
      default: {
        if (keyedEvents) {
          keyedEvents.push(event);
        } else {
          logger.error("keyed events not set", {
            journeyId,
            userId,
            workspaceId,
            event,
          });
        }
        keyedEventIds.add(event.messageId);
        break;
      }
    }
    if (!waitForSegmentIds) {
      return;
    }
    await Promise.all(
      waitForSegmentIds.map(async ({ segmentId }) => {
        const nowMs = Date.now();
        const assignment = await getSegmentAssignmentHandler({
          segmentId,
          now: nowMs,
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

    reportWorkflowInfoHandler();
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

  wf.setHandler(reEvaluateSegmentsSignal, async (params) => {
    logger.info("re-evaluating segments", {
      workflow: WORKFLOW_NAME,
      journeyId,
      userId,
      workspaceId,
      segmentIds: params.segmentIds,
    });

    const segmentIdsToEvaluate =
      params.segmentIds ?? Array.from(segmentAssignments.keys());
    const nowMs = Date.now();

    await Promise.all(
      segmentIdsToEvaluate.map(async (segmentId) => {
        const assignment = await getSegmentAssignmentHandler({
          segmentId,
          now: nowMs,
        });

        if (assignment === null) {
          logger.warn("segment assignment returned null during re-evaluation", {
            workflow: WORKFLOW_NAME,
            journeyId,
            userId,
            workspaceId,
            segmentId,
          });
          return;
        }

        segmentAssignments.set(segmentId, {
          currentlyInSegment: assignment.inSegment,
          segmentVersion: nowMs,
        });

        logger.info("segment re-evaluated", {
          workflow: WORKFLOW_NAME,
          journeyId,
          userId,
          workspaceId,
          segmentId,
          inSegment: assignment.inSegment,
        });
      }),
    );

    reportWorkflowInfoHandler();
  });

  let currentNode: JourneyNode = definition.entryNode;
  let nextNode: JourneyNode | null = null;

  // TODO check if segment was assigned true prior to start of journey
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
      isHidden,
    };
    logger.info("user journey node", {
      ...defaultLoggingFields,
      type: currentNode.type,
    });
    switch (currentNode.type) {
      case JourneyNodeType.SegmentEntryNode: {
        const cn = currentNode;
        const initialSegmentAssignment =
          (
            await getSegmentAssignmentHandler({
              segmentId: cn.segment,
              now: Date.now(),
            })
          )?.inSegment === true;
        if (!initialSegmentAssignment) {
          await wf.condition(() => segmentAssignedTrue(cn.segment));
        }
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
        const lookupResult = nodes.get(currentNode.child);
        nextNode = lookupResult ?? null;
        if (!nextNode) {
          logger.error("missing entry node child", {
            ...defaultLoggingFields,
            child: currentNode.child,
            availableNodes: Array.from(nodes.keys()),
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
            let nextTime: number;
            // Use patch for backwards compatibility with existing workflows
            if (wf.patched("local-delay-improvements")) {
              nextTime = await findNextLocalizedTimeV2({
                workspaceId,
                userId,
                now,
                hour: currentNode.variant.hour,
                minute: currentNode.variant.minute,
                allowedDaysOfWeek: currentNode.variant.allowedDaysOfWeek,
                defaultTimezone: currentNode.variant.defaultTimezone,
              });
            } else {
              // Legacy behavior: hardcoded to 5 AM
              nextTime = await findNextLocalizedTime({
                workspaceId,
                userId,
                now,
              });
            }
            delay = nextTime - now;
            break;
          }
          case DelayVariantType.UserProperty: {
            let params: GetUserPropertyDelayParams;
            if (props.version === UserJourneyWorkflowVersion.V3) {
              params = {
                workspaceId,
                userId,
                userProperty: currentNode.variant.userProperty,
                now: Date.now(),
                offsetSeconds: currentNode.variant.offsetSeconds,
                offsetDirection: currentNode.variant.offsetDirection,
                eventIds: Array.from(keyedEventIds),
                version: "v2",
              } satisfies GetUserPropertyDelayParamsV2;
            } else {
              params = {
                workspaceId,
                userId,
                userProperty: currentNode.variant.userProperty,
                now: Date.now(),
                offsetSeconds: currentNode.variant.offsetSeconds,
                offsetDirection: currentNode.variant.offsetDirection,
                events: keyedEvents,
              } satisfies GetUserPropertyDelayParamsV1;
            }
            const userPropertyDelay = await getUserPropertyDelay(params);
            delay = userPropertyDelay ?? 0;
            break;
          }
          default: {
            logger.error("un-implemented delay variant", {
              ...defaultLoggingFields,
              variant: currentNode.variant,
            });
            nextNode = definition.exitNode;
            delay = 0;
            break;
          }
        }
        if (delay > 0) {
          logger.info("sleeping", {
            delay,
            ...defaultLoggingFields,
          });
          await sleep(delay);
        } else {
          logger.info("no delay", {
            ...defaultLoggingFields,
          });
        }
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
        const initialSegmentAssignments: SegmentAssignmentDb[] = (
          await Promise.all(
            segmentChildren.map(async ({ segmentId }) => {
              const assignment = await getSegmentAssignmentHandler({
                segmentId,
                now: Date.now(),
              });
              if (assignment === null) {
                return [];
              }
              if (assignment.inSegment) {
                segmentAssignments.set(segmentId, {
                  currentlyInSegment: assignment.inSegment,
                  segmentVersion: Date.now(),
                });
              }
              return [];
            }),
          )
        ).flat();
        let satisfiedSegmentWithinTimeout: boolean =
          initialSegmentAssignments.some((assignment) => assignment.inSegment);

        if (!satisfiedSegmentWithinTimeout) {
          satisfiedSegmentWithinTimeout = await wf.condition(
            () => segmentChildren.some((s) => segmentAssignedTrue(s.segmentId)),
            timeoutSeconds * 1000,
          );
        }
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

        const segmentAssignment = await getSegmentAssignmentHandler({
          segmentId: cn.variant.segment,
          now: Date.now(),
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
        let triggeringMessageId: string | undefined;
        switch (props.version) {
          case undefined:
          case UserJourneyWorkflowVersion.V1: {
            break;
          }
          case UserJourneyWorkflowVersion.V2: {
            triggeringMessageId = props.event?.messageId;
            break;
          }
          case UserJourneyWorkflowVersion.V3: {
            triggeringMessageId = props.messageId;
            break;
          }
          default: {
            assertUnreachable(props);
          }
        }
        const messagePayload: Omit<activities.SendParams, "templateId"> = {
          userId,
          workspaceId,
          journeyId,
          subscriptionGroupId: currentNode.subscriptionGroupId,
          runId,
          nodeId: currentNode.id,
          messageId,
          triggeringMessageId,
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
            const { providerOverride, senderOverride } = currentNode.variant;

            let smsProviderOverride: SmsProviderOverride;
            switch (providerOverride) {
              case SmsProviderType.Twilio: {
                smsProviderOverride = {
                  providerOverride: SmsProviderType.Twilio,
                  senderOverride,
                };
                break;
              }
              case SmsProviderType.Test: {
                smsProviderOverride = {
                  providerOverride: SmsProviderType.Test,
                  senderOverride: undefined,
                };
                break;
              }
              default: {
                smsProviderOverride = {};
              }
            }

            const smsVariant: RenameKey<SmsMessageVariant, "type", "channel"> =
              {
                ...smsProviderOverride,
                templateId: currentNode.variant.templateId,
                channel: currentNode.variant.type,
              };
            variant = smsVariant;
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

        const sendMesssageParams: SendParamsV2 = {
          ...messagePayload,
          ...variant,
          events: keyedEvents,
          context: entryEventProperties,
          isHidden,
        };
        if (currentNode.retryCount) {
          sendMesssageParams.retryCount = currentNode.retryCount;
        }
        if (props.version === UserJourneyWorkflowVersion.V3) {
          sendMesssageParams.eventIds = Array.from(keyedEventIds);
        }

        const { sendMessageV2 } = proxyActivities<typeof activities>({
          startToCloseTimeout: "2 minutes",
          retry: {
            maximumAttempts: currentNode.retryCount ?? 3,
          },
        });
        const messageSucceeded = await sendMessageV2(sendMesssageParams);

        if (!messageSucceeded && !currentNode.skipOnFailure) {
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
      case JourneyNodeType.RandomCohortNode: {
        const cn: RandomCohortNode = currentNode;
        // Use getRandom local activity for deterministic behavior
        const randomValue = (await getRandomNumber()) * 100;

        let cumulativePercent = 0;
        let selectedChildId: string | null = null;

        for (const child of cn.children) {
          cumulativePercent += child.percent;
          if (randomValue < cumulativePercent) {
            selectedChildId = child.id;
            break;
          }
        }

        if (!selectedChildId) {
          logger.error("no child selected in random cohort", {
            ...defaultLoggingFields,
            randomValue,
          });
          nextNode = definition.exitNode;
          break;
        }

        nextNode = nodes.get(selectedChildId) ?? null;

        if (!nextNode) {
          logger.error("missing random cohort child node", {
            ...defaultLoggingFields,
            childId: selectedChildId,
          });
          nextNode = definition.exitNode;
          break;
        }
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

    reportWorkflowInfoHandler();

    // check if workspace is inactive after a long running node
    if (LONG_RUNNING_NODE_TYPES.has(currentNode.type)) {
      const workspace = await getWorkspace(workspaceId);
      if (workspace?.status !== "Active") {
        logger.info("workspace is not active, exiting journey", {
          workspaceId,
          userId,
          journeyId,
        });
        break;
      }
    }
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

  reportWorkflowInfoHandler();

  if (await shouldReEnter({ journeyId, userId, workspaceId })) {
    if (shouldContinueAsNew) {
      await continueAsNew<typeof userJourneyWorkflow>(props);
    } else {
      return props;
    }
  }
  return null;
}
