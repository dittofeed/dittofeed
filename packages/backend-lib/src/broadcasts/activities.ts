import { zonedTimeToUtc } from "date-fns-tz";
import { and, eq } from "drizzle-orm";

import { db } from "../db";
import * as schema from "../db/schema";
import logger from "../logger";
import { Sender, sendMessage } from "../messaging";
import { withSpan } from "../openTelemetry";
import {
  BroadcastResourceV2,
  BroadcastV2Config,
  BroadcastV2Status,
} from "../types";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";

interface SendMessagesResponse {
  messagesSent: number;
  nextCursor?: string;
}

interface SendMessagesParams {
  workspaceId: string;
  broadcastId: string;
  timezones?: string[];
  cursor?: string;
  limit: number;
}

export function sendMessagesFactory(sender: Sender) {
  return async function sendMessagesWithSender(
    params: SendMessagesParams,
  ): Promise<SendMessagesResponse> {
    return withSpan({ name: "send-messages" }, async (span) => {
      span.setAttributes({
        workspaceId: params.workspaceId,
        broadcastId: params.broadcastId,
        timezones: params.timezones,
        cursor: params.cursor,
        limit: params.limit,
      });
      throw new Error("Not implemented");
    });
  };
}

export const sendMessages = sendMessagesFactory(sendMessage);

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
}): Promise<void> {
  await db()
    .update(schema.broadcast)
    .set({
      statusV2: status,
    })
    .where(
      and(
        eq(schema.broadcast.id, broadcastId),
        eq(schema.broadcast.workspaceId, workspaceId),
      ),
    );
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
