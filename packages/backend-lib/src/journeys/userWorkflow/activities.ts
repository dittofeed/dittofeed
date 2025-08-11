import { SpanStatusCode } from "@opentelemetry/api";
import { and, eq, inArray } from "drizzle-orm";
import { ENTRY_TYPES } from "isomorphic-lib/src/constants";
import { stableJsonStringify } from "isomorphic-lib/src/equality";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok } from "neverthrow";
import { omit } from "remeda";
import { v5 as uuidv5 } from "uuid";

import { submitTrack } from "../../apps/track";
import {
  WORKFLOW_HISTORY_LENGTH_METRIC,
  WORKFLOW_HISTORY_SIZE_METRIC,
} from "../../constants";
import { db } from "../../db";
import {
  journey as dbJourney,
  segment as dbSegment,
  userJourneyEvent as dbUserJourneyEvent,
  workspace as dbWorkspace,
} from "../../db/schema";
import logger from "../../logger";
import { Sender, sendMessage, SendMessageParameters } from "../../messaging";
import { getMeter, withSpan } from "../../openTelemetry";
import { calculateKeyedSegment, getSegmentAssignmentDb } from "../../segments";
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
  JSONValue,
  MessageTags,
  MessageVariant,
  OptionalAllOrNothing,
  RenameKey,
  SegmentAssignment,
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
  triggeringMessageId?: string;
} & RenameKey<MessageVariant, "type", "channel">;

export type SendParams = Omit<BaseSendParams, "channel">;

export type SendParamsV2 = BaseSendParams & {
  context?: Record<string, JSONValue>;
  events?: UserWorkflowTrackEvent[];
  isHidden?: boolean;
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
      db().query.journey.findFirst({ where: eq(dbJourney.id, journeyId) }),
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

  const messageTags: MessageTags = {
    workspaceId,
    runId,
    nodeId,
    journeyId,
    templateId,
    messageId,
    userId,
    channel: rest.channel,
  };
  if (rest.triggeringMessageId) {
    messageTags.triggeringMessageId = rest.triggeringMessageId;
  }
  const result = await sender({
    workspaceId,
    useDraft: false,
    templateId,
    userId,
    userPropertyAssignments,
    subscriptionGroupDetails,
    messageTags,
    ...rest,
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
        triggeringMessageId: params.triggeringMessageId,
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
        triggeringMessageId: params.triggeringMessageId,
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

      const context: TrackData["context"] = {};
      if (params.isHidden) {
        context.hidden = true;
      }
      const trackData: TrackData = {
        userId,
        messageId,
        event,
        timestamp: now.toISOString(),
        context,
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
    db().query.userJourneyEvent.findFirst({
      where: and(
        eq(dbUserJourneyEvent.journeyId, journeyId),
        eq(dbUserJourneyEvent.userId, userId),
        eventKey ? eq(dbUserJourneyEvent.eventKey, eventKey) : undefined,
        eventKeyName
          ? eq(dbUserJourneyEvent.eventKeyName, eventKeyName)
          : undefined,
        inArray(dbUserJourneyEvent.type, Array.from(ENTRY_TYPES)),
      ),
    }),
    db().query.journey.findFirst({ where: eq(dbJourney.id, journeyId) }),
    workspaceId
      ? db().query.workspace.findFirst({
          where: eq(dbWorkspace.id, workspaceId),
        })
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
  if (workspace?.status !== "Active") {
    logger().debug(
      {
        workspace: workspace ?? "missing",
      },
      "workspace is not active, journey is not runnable",
    );
    return false;
  }
  return canRunMultiple;
}

export async function onNodeProcessedV2(params: RecordNodeProcessedParams) {
  await recordNodeProcessed(params);
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
  return withSpan({ name: "get-segment-assignment" }, async (span) => {
    span.setAttributes({
      workspaceId: params.workspaceId,
      segmentId: params.segmentId,
      userId: params.userId,
    });
    const { workspaceId, segmentId, userId } = params;
    const segment = await db().query.segment.findFirst({
      where: eq(dbSegment.id, segmentId),
    });
    if (!segment) {
      logger().error(
        {
          segmentId,
          workspaceId,
        },
        "segment not found",
      );
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: "segment not found",
      });
      return null;
    }
    if (
      !(
        "version" in params &&
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        params.version === GetSegmentAssignmentVersion.V1
      )
    ) {
      span.setAttribute("version", GetSegmentAssignmentVersion.V1);
      const assignment =
        (await getSegmentAssignmentDb({
          workspaceId,
          segmentId,
          userId,
        })) ?? false;

      span.setAttributes({
        source: "db",
        inSegment: String(assignment),
      });

      return {
        userId,
        workspaceId,
        segmentId,
        inSegment: assignment,
      };
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
      const assignment =
        (await getSegmentAssignmentDb({
          workspaceId,
          segmentId,
          userId,
        })) ?? false;
      span.setAttributes({
        source: "db",
        inSegment: String(assignment),
      });
      return {
        userId,
        workspaceId,
        segmentId,
        inSegment: assignment,
      };
    }
    const inSegment = calculateKeyedSegment({
      events: params.events,
      keyValue: params.keyValue,
      definition: entryNode,
    });
    span.setAttributes({
      source: "mem",
      inSegment,
    });
    return {
      userId,
      workspaceId,
      segmentId,
      inSegment,
    };
  });
}

export function getWorkspace(workspaceId: string) {
  return db().query.workspace.findFirst({
    where: eq(dbWorkspace.id, workspaceId),
  });
}

export { getEarliestComputePropertyPeriod } from "../../computedProperties/periods";

type MetricAttributes = Record<string, string>;

interface RunningMaxEntry {
  attributes: MetricAttributes;
  value: number;
}

const WORKFLOW_HISTORY_SIZE_MAX = new Map<string, RunningMaxEntry>();
const WORKFLOW_HISTORY_LENGTH_MAX = new Map<string, RunningMaxEntry>();

const WORKFLOW_HISTORY_RUNNING_MAX_NAMESPACE =
  "33a6efcb-9d9f-49e2-ad27-8cdc3bb9d7a8" as const;

function stableAttributesKey(attrs: MetricAttributes): string {
  const stringified = stableJsonStringify(attrs);
  const key = uuidv5(stringified, WORKFLOW_HISTORY_RUNNING_MAX_NAMESPACE);
  return key;
}

function recordRunningMax(
  map: Map<string, RunningMaxEntry>,
  attributes: MetricAttributes,
  value: number,
) {
  const key = stableAttributesKey(attributes);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { attributes, value });
    return;
  }
  if (value > existing.value) {
    existing.value = value;
  }
}

let historyGaugesInitialized = false;
function ensureHistoryGaugesInitialized() {
  if (historyGaugesInitialized) return;
  const meter = getMeter();
  const sizeGauge = meter.createObservableGauge(WORKFLOW_HISTORY_SIZE_METRIC, {
    description: "Max workflow history size in bytes (per export interval)",
    unit: "bytes",
  });
  const lengthGauge = meter.createObservableGauge(
    WORKFLOW_HISTORY_LENGTH_METRIC,
    {
      description:
        "Max workflow history length in events (per export interval)",
      unit: "1",
    },
  );

  meter.addBatchObservableCallback(
    (observer) => {
      for (const { attributes, value } of WORKFLOW_HISTORY_SIZE_MAX.values()) {
        observer.observe(sizeGauge, value, attributes);
      }
      for (const {
        attributes,
        value,
      } of WORKFLOW_HISTORY_LENGTH_MAX.values()) {
        observer.observe(lengthGauge, value, attributes);
      }
      WORKFLOW_HISTORY_SIZE_MAX.clear();
      WORKFLOW_HISTORY_LENGTH_MAX.clear();
    },
    [sizeGauge, lengthGauge],
  );
  historyGaugesInitialized = true;
}

export async function shouldReEnter({
  journeyId,
  userId,
  workspaceId,
}: {
  journeyId: string;
  userId: string;
  workspaceId: string;
}): Promise<boolean> {
  const journey = await db().query.journey.findFirst({
    where: and(
      eq(dbJourney.id, journeyId),
      eq(dbJourney.workspaceId, workspaceId),
    ),
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
  const assignment = await getSegmentAssignmentDb({
    workspaceId,
    segmentId: definition.entryNode.segment,
    userId,
  });
  return assignment === true && definition.entryNode.reEnter === true;
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function reportWorkflowInfo({
  historySize,
  historyLength,
  workspaceId,
  journeyId,
}: {
  historySize: number;
  historyLength: number;
  workspaceId: string;
  journeyId: string;
}): Promise<void> {
  ensureHistoryGaugesInitialized();
  const journey = await db().query.journey.findFirst({
    where: and(
      eq(dbJourney.id, journeyId),
      eq(dbJourney.workspaceId, workspaceId),
    ),
    columns: {
      name: true,
    },
  });
  if (!journey) {
    logger().error(
      {
        journeyId,
        workspaceId,
      },
      "journey not found",
    );
    return;
  }

  const attributes: MetricAttributes = {
    workspaceId,
    journeyName: journey.name,
  };
  recordRunningMax(WORKFLOW_HISTORY_SIZE_MAX, attributes, historySize);
  recordRunningMax(WORKFLOW_HISTORY_LENGTH_MAX, attributes, historyLength);
}
