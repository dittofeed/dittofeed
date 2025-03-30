import { zonedTimeToUtc } from "date-fns-tz";

import logger from "../logger";
import { Broadcast, BroadcastResourceV2, BroadcastV2Status } from "../types";

export async function sendMessages({
  workspaceId,
  broadcastId,
  cursor,
  timezones,
  limit,
}: {
  workspaceId: string;
  broadcastId: string;
  timezones?: string[];
  cursor?: string;
  limit: number;
}): Promise<{
  nextCursor?: string;
  messagesSent: number;
}> {
  throw new Error("Not implemented");
}

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
}): Promise<BroadcastResourceV2> {
  throw new Error("Not implemented");
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
  throw new Error("Not implemented");
}

export async function getBroadcastStatus({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}): Promise<{ status: BroadcastV2Status }> {
  throw new Error("Not implemented");
}
