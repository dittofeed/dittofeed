import { add, getUnixTime } from "date-fns";
import { getTimezoneOffset, zonedTimeToUtc } from "date-fns-tz";
import { find as findTz } from "geo-tz";

import logger from "./logger";
import { LocalTimeDelayVariantFields, UserWorkflowTrackEvent } from "./types";
import {
  findAllUserPropertyAssignments,
  findAllUserPropertyAssignmentsById,
} from "./userProperties";

const DEFAULT_TIMEZONE = "UTC";
const EVERY_DAY_IN_WEEK = new Set([0, 1, 2, 3, 4, 5, 6]);

function getTimezone({ latLon }: { latLon: string }): string {
  const splitStr = latLon.split(",");
  const lat = Number(splitStr[0]);
  const lon = Number(splitStr[1]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return DEFAULT_TIMEZONE;
  }
  const tz = findTz(lat, lon)[0];
  if (!tz) {
    return DEFAULT_TIMEZONE;
  }
  return tz;
}

export function findNextLocalizedTimeInner({
  latLon,
  now,
  hour,
  minute = 0,
  allowedDaysOfWeek,
}: LocalTimeDelayVariantFields & {
  latLon?: string;
  now: number;
}): number {
  const timezone =
    typeof latLon === "string" ? getTimezone({ latLon }) : DEFAULT_TIMEZONE;
  const offset = getTimezoneOffset(timezone, now);
  const zoned = offset + now;

  let adjusted = new Date(zoned);
  adjusted.setUTCHours(hour, minute, 0, 0);

  const allowedDays = allowedDaysOfWeek
    ? new Set(allowedDaysOfWeek)
    : EVERY_DAY_IN_WEEK;

  for (let i = 0; i < 8; i++) {
    const local = adjusted.getTime() - offset;
    if (
      adjusted.getTime() > zoned &&
      allowedDays.has(new Date(local).getUTCDay())
    ) {
      return local;
    }
    adjusted = add(adjusted, { days: 1 });
  }

  throw new Error("Could not find next localized time");
}

export async function findNextLocalizedTime({
  workspaceId,
  userId,
  now,
}: {
  workspaceId: string;
  userId: string;
  now: number;
}): Promise<number> {
  const { latLon } = await findAllUserPropertyAssignments({
    workspaceId,
    userId,
    userProperties: ["latLon"],
  });
  return findNextLocalizedTimeInner({
    latLon: typeof latLon === "string" ? latLon : undefined,
    now,
    hour: 5,
  });
}

/**
 * Returns the delay in milliseconds to wait for a user property delay.
 * Returns null if the user property is not a date.
 *
 * @param now - The current time in milliseconds since epoch.
 * @param userProperty - The user property to get the delay for. Will try to
 * parse as a date accepting ISO 8601 strings, unix timestamps in seconds, and
 * unix timestamps in milliseconds.
 * @param offsetSeconds - The number of seconds to offset the delay by.
 * @param offsetDirection - The direction to offset the delay.
 */
export async function getUserPropertyDelay({
  workspaceId,
  userId,
  userProperty,
  now,
  offsetSeconds = 0,
  offsetDirection = "after",
  events,
}: {
  workspaceId: string;
  userId: string;
  userProperty: string;
  now: number;
  events?: UserWorkflowTrackEvent[];
  offsetSeconds?: number;
  offsetDirection?: "before" | "after";
}): Promise<number | null> {
  const assignments = await findAllUserPropertyAssignmentsById({
    workspaceId,
    userId,
    userPropertyIds: [userProperty],
    context: events?.flatMap((e) => e.properties ?? []),
  });

  const assignment = assignments[userProperty];
  if (!assignment) {
    logger().debug(
      {
        workspaceId,
        userId,
        userProperty,
        assignments,
      },
      "no assignment in user property delay",
    );
    return null;
  }

  // Try parsing different date formats
  let date: Date | null = null;

  if (typeof assignment === "string") {
    // Try ISO string
    const parsedDate = new Date(assignment);
    if (!Number.isNaN(parsedDate.getTime())) {
      date = parsedDate;
    }
  } else if (typeof assignment === "number") {
    // Try unix timestamp (seconds or milliseconds)
    const timestamp = assignment < 1e12 ? assignment * 1000 : assignment;
    const parsedDate = new Date(timestamp);
    if (!Number.isNaN(parsedDate.getTime())) {
      date = parsedDate;
    }
  }

  if (!date) {
    logger().debug(
      {
        workspaceId,
        userId,
        userProperty,
        assignment,
      },
      "no date in user property delay",
    );
    return null;
  }

  const offsetMs = offsetSeconds * 1000;
  const targetTime =
    offsetDirection === "before"
      ? date.getTime() - offsetMs
      : date.getTime() + offsetMs;

  const delay = targetTime - now;
  return delay > 0 ? delay : null;
}
