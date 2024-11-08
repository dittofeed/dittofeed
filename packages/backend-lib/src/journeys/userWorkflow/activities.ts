import { SegmentAssignment } from "@prisma/client";
import { ENTRY_TYPES } from "isomorphic-lib/src/constants";
import { err, ok } from "neverthrow";
import { omit } from "remeda";

import { submitTrack } from "../../apps/track";
import { sendMessage } from "../../messaging";
import prisma from "../../prisma";
import {
  getSubscriptionGroupDetails,
  getSubscriptionGroupWithAssignment,
} from "../../subscriptionGroups";
import {
  BackendMessageSendResult,
  BadWorkspaceConfigurationType,
  InternalEventType,
  JSONValue,
  MessageVariant,
  RenameKey,
  TrackData,
} from "../../types";
import { findAllUserPropertyAssignments } from "../../userProperties";
import {
  recordNodeProcessed,
  RecordNodeProcessedParams,
} from "../recordNodeProcessed";

export { findNextLocalizedTime } from "../../dates";
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
  context,
  ...rest
}: SendParamsV2): Promise<BackendMessageSendResult> {
  const [userPropertyAssignments, journey, subscriptionGroup] =
    await Promise.all([
      // FIXME add context awareness
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

  const result = await sendMessage({
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

export async function sendMessageV2(params: SendParamsV2): Promise<boolean> {
  const { messageId, userId, journeyId, nodeId, templateId, runId } = params;
  const now = new Date();
  // FIXME add context awareness
  const sendResult = await sendMessageInner(params);
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

  await submitTrack({
    workspaceId: params.workspaceId,
    data: trackData,
  });
  return shouldContinue;
}

export async function isRunnable({
  userId,
  journeyId,
  eventKey,
}: {
  journeyId: string;
  userId: string;
  eventKey?: string;
}): Promise<boolean> {
  const [previousExitEvent, journey] = await Promise.all([
    prisma().userJourneyEvent.findFirst({
      where: {
        journeyId,
        userId,
        eventKey,
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
  ]);
  return previousExitEvent === null || !!journey?.canRunMultiple;
}

export async function onNodeProcessedV2(params: RecordNodeProcessedParams) {
  await recordNodeProcessed(params);
}

export function getSegmentAssignment({
  workspaceId,
  segmentId,
  userId,
}: {
  workspaceId: string;
  segmentId: string;
  userId: string;
}): Promise<SegmentAssignment | null> {
  // FIXME add context awareness
  return prisma().segmentAssignment.findUnique({
    where: {
      workspaceId_userId_segmentId: {
        workspaceId,
        segmentId,
        userId,
      },
    },
  });
}

export { getEarliestComputePropertyPeriod } from "../../computedProperties/periods";
