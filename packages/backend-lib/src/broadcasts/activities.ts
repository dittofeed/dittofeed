import { zonedTimeToUtc } from "date-fns-tz";
import { and, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { omit } from "remeda";
import { v5 as uuidV5 } from "uuid";

import { submitBatch } from "../apps/batch";
import { db } from "../db";
import * as schema from "../db/schema";
import { searchDeliveries } from "../deliveries";
import logger from "../logger";
import {
  Sender,
  sendMessage,
  SendMessageParameters,
  SendMessageParametersBase,
} from "../messaging";
import { withSpan } from "../openTelemetry";
import {
  BackendMessageSendResult,
  BatchTrackData,
  BroadcastResourceV2,
  BroadcastV2Config,
  BroadcastV2Status,
  ChannelType,
  EventType,
  GetUsersResponseItem,
  InternalEventType,
  TrackData,
} from "../types";
import { getUsers } from "../users";

/**
 * Computes the timezones for all users in a broadcast using timezone, lat/lon,
 * ip address, or default timezone for the broadcast.
 * @param param0
 * @returns A list of unique timezones corresponding to the users in the broadcast.
 */
export async function computeTimezones({
  workspaceId,
  defaultTimezone,
}: {
  workspaceId: string;
  defaultTimezone: string;
}): Promise<{
  timezones: string[];
}> {
  // FIXME validate timezones and submit errors to user events for users with invalid timezones
  throw new Error("Not implemented");
}

export async function getBroadcast({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}): Promise<BroadcastResourceV2 | null> {
  const model = await db().query.broadcast.findFirst({
    where: and(
      eq(schema.broadcast.id, broadcastId),
      eq(schema.broadcast.workspaceId, workspaceId),
    ),
  });
  if (!model) {
    return null;
  }
  const configResult = schemaValidateWithErr(model.config, BroadcastV2Config);
  if (configResult.isErr()) {
    logger().error(
      {
        err: configResult.error,
        broadcastId,
        workspaceId,
      },
      "Error validating broadcast config",
    );
    return null;
  }
  if (model.statusV2 === null) {
    logger().error(
      {
        broadcastId,
        workspaceId,
      },
      "Broadcast status is null",
    );
    return null;
  }
  return {
    workspaceId: model.workspaceId,
    config: configResult.value,
    id: model.id,
    name: model.name,
    status: model.statusV2,
    messageTemplateId: model.messageTemplateId ?? undefined,
    segmentId: model.segmentId ?? undefined,
    subscriptionGroupId: model.subscriptionGroupId ?? undefined,
    createdAt: model.createdAt.getTime(),
    updatedAt: model.updatedAt.getTime(),
  };
}

interface SendMessagesResponse {
  messagesSent: number;
  nextCursor?: string;
  includesNonRetryableError: boolean;
}

interface SendMessagesParams {
  workspaceId: string;
  broadcastId: string;
  timezones?: string[];
  cursor?: string;
  limit: number;
}

async function getUnmessagedUsers(
  params: Parameters<typeof getUsers>[0] & {
    broadcastId: string;
  },
): Promise<{
  users: GetUsersResponseItem[];
  nextCursor?: string;
}> {
  const { broadcastId, ...rest } = params;
  const { users, nextCursor } = await getUsers(rest, {
    allowInternalSegment: true,
  }).then(unwrap);
  const now = new Date();

  // TODO implement timezones
  const alreadySent = await searchDeliveries({
    workspaceId: params.workspaceId,
    broadcastId,
    userId: users.map((user) => user.id),
    limit: params.limit,
    endDate: now.toISOString(),
    startDate: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString(),
  });
  logger().debug(
    {
      users,
      alreadySent,
    },
    "Broadcast users",
  );
  return {
    users: users.filter(
      (user) => !alreadySent.items.some((item) => item.userId === user.id),
    ),
    nextCursor,
  };
}

export function sendMessagesFactory(sender: Sender) {
  return async function sendMessagesWithSender(
    params: SendMessagesParams,
  ): Promise<SendMessagesResponse> {
    return withSpan({ name: "send-messages" }, async (span) => {
      const now = new Date();
      span.setAttributes({
        workspaceId: params.workspaceId,
        broadcastId: params.broadcastId,
        timezones: params.timezones,
        cursor: params.cursor,
        limit: params.limit,
      });
      const broadcast = await getBroadcast({
        workspaceId: params.workspaceId,
        broadcastId: params.broadcastId,
      });
      if (!broadcast) {
        throw new Error("Broadcast not found");
      }
      const { messageTemplateId, config: unparsedConfig } = broadcast;
      if (!messageTemplateId) {
        throw new Error("Broadcast template is null");
      }
      const configResult = schemaValidateWithErr(
        unparsedConfig,
        BroadcastV2Config,
      );
      if (configResult.isErr()) {
        throw new Error("Broadcast config is invalid");
      }
      const config = configResult.value;

      span.setAttributes({
        segmentId: broadcast.segmentId,
        subscriptionGroupId: broadcast.subscriptionGroupId,
        templateId: broadcast.messageTemplateId,
      });

      if (!broadcast.subscriptionGroupId) {
        throw new Error("Broadcast subscription group is null");
      }

      const subscriptionGroup = await db().query.subscriptionGroup.findFirst({
        where: eq(schema.subscriptionGroup.id, broadcast.subscriptionGroupId),
        with: {
          segments: true,
        },
      });
      if (!subscriptionGroup) {
        throw new Error("Subscription group not found");
      }
      const subscriptionGroupSegment = subscriptionGroup.segments[0];
      if (!subscriptionGroupSegment) {
        throw new Error("Subscription group segment not found");
      }

      const { users, nextCursor } = await getUnmessagedUsers({
        workspaceId: params.workspaceId,
        segmentFilter: broadcast.segmentId ? [broadcast.segmentId] : undefined,
        // This will account for subscription group logic
        subscriptionGroupFilter: broadcast.subscriptionGroupId
          ? [broadcast.subscriptionGroupId]
          : undefined,
        cursor: params.cursor,
        limit: params.limit,
        broadcastId: params.broadcastId,
      });

      const promises: Promise<{
        userId: string;
        result: BackendMessageSendResult;
        isAnonymous: boolean;
      }>[] = users.flatMap((user) => {
        return withSpan({ name: "send-messages-user" }, async (usersSpan) => {
          const isAnonymous = Object.values(user.properties).some(
            (property) => property.name === "anonymousId",
          );

          usersSpan.setAttributes({
            userId: user.id,
            isAnonymous,
            workspaceId: params.workspaceId,
            broadcastId: params.broadcastId,
            templateId: broadcast.messageTemplateId,
            segmentId: broadcast.segmentId,
            subscriptionGroupId: broadcast.subscriptionGroupId,
          });

          const baseParams: SendMessageParametersBase = {
            userId: user.id,
            workspaceId: params.workspaceId,
            templateId: messageTemplateId,
            useDraft: false,
            userPropertyAssignments: user.properties,
          };
          let messageVariant: SendMessageParameters;
          switch (config.message.type) {
            case ChannelType.Email:
              messageVariant = {
                ...baseParams,
                ...config.message,
                channel: ChannelType.Email,
              };
              break;
            case ChannelType.Sms:
              messageVariant = {
                ...baseParams,
                ...config.message,
                channel: ChannelType.Sms,
              };
              break;
            case ChannelType.Webhook:
              messageVariant = {
                ...baseParams,
                ...config.message,
                channel: ChannelType.Webhook,
              };
              break;
          }
          const result = await sender(messageVariant);
          return {
            userId: user.id,
            isAnonymous,
            result,
          };
        });
      });
      const results = await Promise.all(promises);
      const baseProperties: TrackData["properties"] = {
        broadcastId: params.broadcastId,
        templateId: broadcast.messageTemplateId,
        workspaceId: params.workspaceId,
      };
      const events: BatchTrackData[] = results.map(
        ({ userId, result, isAnonymous }) => {
          const messageId = uuidV5(
            `${userId}-${params.broadcastId}`,
            params.workspaceId,
          );
          let event: InternalEventType;
          let trackingProperties: TrackData["properties"];
          if (result.isErr()) {
            event = result.error.type;
            trackingProperties = {
              ...baseProperties,
              ...omit(result.error, ["type"]),
            };
          } else {
            event = result.value.type;
            trackingProperties = {
              ...baseProperties,
              ...omit(result.value, ["type"]),
            };
          }
          return {
            ...(isAnonymous
              ? {
                  anonymousId: userId,
                }
              : {
                  userId,
                }),
            messageId,
            type: EventType.Track,
            timestamp: now.toISOString(),
            event,
            properties: trackingProperties,
          };
        },
      );
      logger().debug({ events }, "Broadcast events");
      await submitBatch({
        workspaceId: params.workspaceId,
        data: {
          batch: events,
        },
      });
      const includesNonRetryableError = results.some(({ result }) =>
        result.isErr(),
      );
      return {
        messagesSent: results.length,
        nextCursor,
        includesNonRetryableError,
      };
    });
  };
}

export const sendMessages = sendMessagesFactory(sendMessage);

/**
 * Converts a naive datetime string (YYYY-MM-DD HH:MM:SS) to a Unix timestamp
 * (in seconds) by interpreting it within the given timezone, using date-fns-tz.
 *
 * @param naiveDateTimeString - The naive datetime string (e.g., "2025-12-25 09:30:00").
 * Assumes a format parseable by date-fns (ISO-like is safest).
 * @param timeZone - The IANA timezone identifier (e.g., "America/New_York", "Europe/London").
 * @returns The Unix timestamp in milliseconds since the epoch.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function getZonedTimestamp({
  naiveDateTimeString,
  timeZone,
}: {
  naiveDateTimeString: string;
  timeZone: string;
}): Promise<{
  timestamp: number | null;
}> {
  try {
    // 1. Parse the naive string, interpreting it in the specified timezone.
    // zonedTimeToUtc takes the date string and the timezone it *represents*.
    // It returns a standard JS Date object holding the equivalent UTC time.
    // Note: Ensure naiveDateTimeString is in a format date-fns can parse.
    // Common formats like 'YYYY-MM-DD HH:MM:SS' are usually okay,
    // but ISO 'YYYY-MM-DDTHH:MM:SS' is generally safer.
    const utcDate: Date = zonedTimeToUtc(naiveDateTimeString, timeZone);

    return {
      timestamp: utcDate.getTime(),
    };
  } catch (error) {
    logger().error(
      {
        naiveDateTimeString,
        timeZone,
        error,
      },
      "Error converting naive datetime to timestamp with date-fns",
    );
    return { timestamp: null };
  }
}

export async function markBroadcastStatus({
  workspaceId,
  broadcastId,
  status,
}: {
  workspaceId: string;
  broadcastId: string;
  status: BroadcastV2Status;
}): Promise<BroadcastV2Status | null> {
  const result = await db()
    .update(schema.broadcast)
    .set({
      statusV2: status,
    })
    .where(
      and(
        eq(schema.broadcast.id, broadcastId),
        eq(schema.broadcast.workspaceId, workspaceId),
      ),
    )
    .returning();
  if (result.length === 0) {
    return null;
  }
  return result[0]?.statusV2 ?? null;
}

export async function getBroadcastStatus({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}): Promise<BroadcastV2Status | null> {
  const model = await db().query.broadcast.findFirst({
    where: and(
      eq(schema.broadcast.id, broadcastId),
      eq(schema.broadcast.workspaceId, workspaceId),
    ),
  });
  if (!model) {
    return null;
  }
  if (model.statusV2 === null) {
    logger().error(
      {
        broadcastId,
        workspaceId,
      },
      "Broadcast status is null",
    );
    return null;
  }
  return model.statusV2;
}
