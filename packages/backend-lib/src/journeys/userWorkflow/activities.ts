import { SegmentAssignment } from "@prisma/client";
import { ENTRY_TYPES } from "isomorphic-lib/src/constants";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok } from "neverthrow";
import { omit } from "remeda";

import { submitTrack } from "../../apps/track";
import logger from "../../logger";
import { Sender, sendMessage, SendMessageParameters } from "../../messaging";
import { withSpan } from "../../openTelemetry";
import prisma from "../../prisma";
import { calculateKeyedSegment } from "../../segments";
import {
  getSubscriptionGroupDetails,
  getSubscriptionGroupWithAssignment,
} from "../../subscriptionGroups";
import {
  BackendMessageSendResult,
  BadWorkspaceConfigurationType,
  InternalEventType,
  JourneyDefinition,
  JourneyNodeType,
  JsonResultType,
  JSONValue,
  MessageVariant,
  OptionalAllOrNothing,
  RenameKey,
  SegmentDefinition,
  SegmentNodeType,
  TrackData,
  UserWorkflowTrackEvent,
} from "../../types";
import { findAllUserPropertyAssignments } from "../../userProperties";
import {
  recordNodeProcessed,
  RecordNodeProcessedParams,
} from "../recordNodeProcessed";
import { GetSegmentAssignmentVersion } from "./types";

export { findNextLocalizedTime, getUserPropertyDelay } from "../../dates";
export { findAllUserPropertyAssignments } from "../../userProperties";

type BaseSendParams = {
  userId: string;
  workspaceId: string;
  runId: string;
  nodeId: string;
  journeyId: string;
  messageId: string;
  subscriptionGroupId?: string;
} & RenameKey<MessageVariant, "type", "channel">;

export type SendParams = Omit<BaseSendParams, "channel">;

export type SendParamsV2 = BaseSendParams & {
  context?: Record<string, JSONValue>;
  events?: UserWorkflowTrackEvent[];
};

export type SendParamsInner = SendParamsV2 & {
  sender: (params: SendMessageParameters) => Promise<BackendMessageSendResult>;
};

async function sendMessageInner({
  userId,
  workspaceId,
  runId,
  nodeId,
  templateId,
  journeyId,
  messageId,
  subscriptionGroupId,
  context: deprecatedContext,
  events,
  sender,
  ...rest
}: SendParamsInner): Promise<BackendMessageSendResult> {
  let context: Record<string, JSONValue>[] | undefined;
  if (events) {
    context = events.flatMap((e) => e.properties ?? []);
  } else if (deprecatedContext) {
    context = [deprecatedContext];
  }
  const [userPropertyAssignments, journey, subscriptionGroup] =
    await Promise.all([
      findAllUserPropertyAssignments({ userId, workspaceId, context }),
      prisma().journey.findUnique({ where: { id: journeyId } }),
      subscriptionGroupId
        ? getSubscriptionGroupWithAssignment({ userId, subscriptionGroupId })
        : null,
    ]);

  const subscriptionGroupDetails = subscriptionGroup
    ? {
        ...getSubscriptionGroupDetails(subscriptionGroup),
        name: subscriptionGroup.name,
      }
    : undefined;

  if (!journey) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.JourneyNotFound,
      },
    });
  }

  if (!(journey.status === "Running" || journey.status === "Broadcast")) {
    return ok({
      type: InternalEventType.MessageSkipped,
      message: "Journey is not running",
    });
  }

  const result = await sender({
    workspaceId,
    useDraft: false,
    templateId,
    userId,
    userPropertyAssignments,
    subscriptionGroupDetails,
    ...rest,
    messageTags: {
      workspaceId,
      runId,
      nodeId,
      journeyId,
      templateId,
      messageId,
      userId,
      channel: rest.channel,
    },
  });
  return result;
}

export function sendMessageFactory(sender: Sender) {
  return async function sendMessageWithSender(
    params: SendParamsV2,
  ): Promise<boolean> {
    return withSpan({ name: "sendMessageWithSender" }, async (span) => {
      span.setAttributes({
        workspaceId: params.workspaceId,
        messageId: params.messageId,
        userId: params.userId,
        journeyId: params.journeyId,
        nodeId: params.nodeId,
        templateId: params.templateId,
        runId: params.runId,
      });
      const { messageId, userId, journeyId, nodeId, templateId, runId } =
        params;
      const now = new Date();
      const sendResult = await sendMessageInner({
        ...params,
        sender,
      });
      let shouldContinue: boolean;
      let event: InternalEventType;
      let trackingProperties: TrackData["properties"] = {
        journeyId,
        nodeId,
        templateId,
        runId,
      };

      if (sendResult.isErr()) {
        shouldContinue = false;
        event = sendResult.error.type;

        trackingProperties = {
          ...trackingProperties,
          ...omit(sendResult.error, ["type"]),
        };
      } else {
        shouldContinue = true;
        event = sendResult.value.type;

        trackingProperties = {
          ...trackingProperties,
          ...omit(sendResult.value, ["type"]),
        };
      }

      const trackData: TrackData = {
        userId,
        messageId,
        event,
        timestamp: now.toISOString(),
        properties: trackingProperties,
      };
      logger().debug({ trackData }, "send message track data");

      await submitTrack({
        workspaceId: params.workspaceId,
        data: trackData,
      });
      return shouldContinue;
    });
  };
}

export const sendMessageV2 = sendMessageFactory(sendMessage);

export async function isRunnable({
  workspaceId,
  journeyId,
  userId,
  eventKey,
  eventKeyName,
}: {
  // optional so that this is backwards compatible, but should be provided
  // moving forward
  workspaceId?: string;
  journeyId: string;
  userId: string;
  eventKey?: string;
  eventKeyName?: string;
}): Promise<boolean> {
  const [previousExitEvent, journey, workspace] = await Promise.all([
    prisma().userJourneyEvent.findFirst({
      where: {
        journeyId,
        userId,
        eventKey,
        eventKeyName,
        type: {
          in: Array.from(ENTRY_TYPES),
        },
      },
    }),
    prisma().journey.findUnique({
      where: {
        id: journeyId,
      },
    }),
    workspaceId
      ? prisma().workspace.findUnique({ where: { id: workspaceId } })
      : null,
  ]);
  if (!previousExitEvent) {
    return true;
  }

  logger().debug(
    {
      previousExitEvent,
    },
    "previous exit event found, checking if journey is runnable",
  );
  const canRunMultiple = !!journey?.canRunMultiple;
  if (!canRunMultiple) {
    logger().debug(
      {
        canRunMultiple,
        previousExitEvent,
      },
      "can run multiple is false, journey is not runnable",
    );
  }
  if (workspace !== null && workspace.status !== "Active") {
    return false;
  }
  return canRunMultiple;
}

export async function onNodeProcessedV2(params: RecordNodeProcessedParams) {
  await recordNodeProcessed(params);
}

async function getSegmentAssignmentDb({
  workspaceId,
  segmentId,
  userId,
}: {
  workspaceId: string;
  segmentId: string;
  userId: string;
}): Promise<SegmentAssignment | null> {
  const assignment = await prisma().segmentAssignment.findUnique({
    where: {
      workspaceId_userId_segmentId: {
        workspaceId,
        segmentId,
        userId,
      },
    },
  });
  return assignment;
}
export async function getSegmentAssignment(
  params: OptionalAllOrNothing<
    {
      workspaceId: string;
      segmentId: string;
      userId: string;
    },
    {
      keyValue: string;
      nowMs: number;
      events: UserWorkflowTrackEvent[];
      version: GetSegmentAssignmentVersion.V1;
    }
  >,
): Promise<SegmentAssignment | null> {
  const { workspaceId, segmentId, userId } = params;
  const segment = await prisma().segment.findUnique({
    where: {
      id: segmentId,
    },
  });
  if (!segment) {
    logger().error(
      {
        segmentId,
        workspaceId,
      },
      "segment not found",
    );
    return null;
  }
  if (
    !(
      "version" in params &&
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      params.version === GetSegmentAssignmentVersion.V1
    )
  ) {
    return getSegmentAssignmentDb({ workspaceId, segmentId, userId });
  }

  const definitionResult = schemaValidateWithErr(
    segment.definition,
    SegmentDefinition,
  );
  if (definitionResult.isErr()) {
    logger().error(
      {
        err: definitionResult.error,
      },
      "Invalid segment definition",
    );
    return null;
  }
  const { entryNode } = definitionResult.value;
  if (entryNode.type !== SegmentNodeType.KeyedPerformed) {
    return getSegmentAssignmentDb({ workspaceId, segmentId, userId });
  }
  const result = calculateKeyedSegment({
    events: params.events,
    keyValue: params.keyValue,
    definition: entryNode,
  });
  if (result.type === JsonResultType.Err) {
    logger().error(
      {
        err: result.err,
      },
      "error calculating keyed segment",
    );
    return null;
  }
  return {
    userId,
    workspaceId,
    segmentId,
    inSegment: result.value,
  };
}

export function getWorkspace(workspaceId: string) {
  return prisma().workspace.findUnique({ where: { id: workspaceId } });
}

export { getEarliestComputePropertyPeriod } from "../../computedProperties/periods";

export async function shouldReEnter({
  journeyId,
}: {
  journeyId: string;
}): Promise<boolean> {
  const journey = await prisma().journey.findUnique({
    where: { id: journeyId },
  });
  if (!journey) {
    return false;
  }
  if (!journey.canRunMultiple) {
    logger().info(
      {
        journeyId,
        workspaceId: journey.workspaceId,
      },
      "journey cannot run multiple, skipping re-entry",
    );
    return false;
  }
  if (journey.status !== "Running") {
    logger().info(
      {
        journeyId,
        workspaceId: journey.workspaceId,
      },
      "journey is not running, skipping re-entry",
    );
    return false;
  }
  const definitionResult = schemaValidateWithErr(
    journey.definition,
    JourneyDefinition,
  );
  if (definitionResult.isErr()) {
    logger().error(
      {
        err: definitionResult.error,
      },
      "Invalid journey definition",
    );
    return false;
  }
  const definition = definitionResult.value;
  if (definition.entryNode.type !== JourneyNodeType.SegmentEntryNode) {
    return false;
  }
  return definition.entryNode.reEnter === true;
}
