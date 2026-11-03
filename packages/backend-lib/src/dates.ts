import { add } from "date-fns";
import { find as findTz } from "geo-tz";
import { DEFAULT_USER_PROPERTY_DELAY_OFFSET_DIRECTION } from "isomorphic-lib/src/constants";

import { LocalTimeDelayVariantFields, UserWorkflowTrackEvent } from "./types";
import { getTrackEventsById } from "./userEvents";
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

const timezoneOffsetFormatCache = new Map<string, Intl.DateTimeFormat>();

// date-fns-tz v2's getTimezoneOffset misreports some zones for hours around
// their DST transitions (e.g. Australia/Sydney), and sampling the offset
// once at `now` is wrong when the target sits on the other side of a
// transition. Resolve the offset at the candidate instant via Intl instead.
function getTimezoneOffsetAt(timezone: string, at: number): number {
  let format = timezoneOffsetFormatCache.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    timezoneOffsetFormatCache.set(timezone, format);
  }
  const parts = format.formatToParts(new Date(at));
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }
  const partValue = (name: string): number => {
    const value = values[name];
    if (value === undefined) {
      throw new Error(`Missing ${name} in Intl.DateTimeFormat parts`);
    }
    return value;
  };
  const asUtc = Date.UTC(
    partValue("year"),
    partValue("month") - 1,
    partValue("day"),
    partValue("hour"),
    partValue("minute"),
    partValue("second"),
  );
  return asUtc - Math.floor(at / 1000) * 1000;
}

export function findNextLocalizedTimeInner({
  latLon,
  userTimezone,
  defaultTimezone,
  now,
  hour,
  minute = 0,
  allowedDaysOfWeek,
}: LocalTimeDelayVariantFields & {
  latLon?: string;
  userTimezone?: string;
  now: number;
}): number {
  // Priority: user property timezone > latLon-derived timezone > defaultTimezone > UTC
  let timezone: string;
  if (userTimezone) {
    timezone = userTimezone;
  } else if (typeof latLon === "string") {
    timezone = getTimezone({ latLon });
  } else if (defaultTimezone) {
    timezone = defaultTimezone;
  } else {
    timezone = DEFAULT_TIMEZONE;
  }

  const initialOffset = getTimezoneOffsetAt(timezone, now);
  const zoned = initialOffset + now;

  let adjusted = new Date(zoned);
  adjusted.setUTCHours(hour, minute, 0, 0);

  const allowedDays = allowedDaysOfWeek
    ? new Set(allowedDaysOfWeek)
    : EVERY_DAY_IN_WEEK;

  for (let i = 0; i < 8; i++) {
    // Resolve the offset at the candidate instant and iterate to a fixed
    // point: when a DST transition falls between `now` and the target, the
    // offset at the target differs from the offset at `now`.
    const wall = adjusted.getTime();
    let offset = initialOffset;
    let previousOffset: number | undefined;
    for (let j = 0; j < 4; j++) {
      const candidateOffset = getTimezoneOffsetAt(timezone, wall - offset);
      if (candidateOffset === offset) {
        break;
      }
      if (candidateOffset === previousOffset) {
        // Oscillation means the requested wall time falls inside a
        // spring-forward gap and does not exist. Shift forward past the
        // gap, preserving the requested minute (2:30 AM becomes 3:30 AM).
        offset = Math.min(offset, candidateOffset);
        break;
      }
      previousOffset = offset;
      offset = candidateOffset;
    }
    const local = wall - offset;
    if (wall > zoned && allowedDays.has(new Date(local).getUTCDay())) {
      return local;
    }
    adjusted = add(adjusted, { days: 1 });
  }

  throw new Error("Could not find next localized time");
}

/**
 * @deprecated Use findNextLocalizedTimeV2 instead. This function hardcodes hour to 5
 * and doesn't support custom minutes or allowedDaysOfWeek parameters.
 * Kept for backwards compatibility with existing temporal workflows.
 */
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

export async function findNextLocalizedTimeV2({
  workspaceId,
  userId,
  now,
  hour,
  minute,
  allowedDaysOfWeek,
  defaultTimezone,
}: {
  workspaceId: string;
  userId: string;
  now: number;
} & LocalTimeDelayVariantFields): Promise<number> {
  const { latLon, timezone } = await findAllUserPropertyAssignments({
    workspaceId,
    userId,
    userProperties: ["latLon", "timezone"],
  });
  return findNextLocalizedTimeInner({
    latLon: typeof latLon === "string" ? latLon : undefined,
    userTimezone: typeof timezone === "string" ? timezone : undefined,
    defaultTimezone,
    now,
    hour,
    minute,
    allowedDaysOfWeek,
  });
}

export interface BaseGetUserPropertyDelayParams {
  workspaceId: string;
  userId: string;
  userProperty: string;
  now: number;
  offsetSeconds?: number;
  offsetDirection?: "before" | "after";
}

export interface GetUserPropertyDelayParamsV1
  extends BaseGetUserPropertyDelayParams {
  events?: UserWorkflowTrackEvent[];
}

export interface GetUserPropertyDelayParamsV2
  extends BaseGetUserPropertyDelayParams {
  eventIds: string[];
  version: "v2";
}

export type GetUserPropertyDelayParams =
  | GetUserPropertyDelayParamsV1
  | GetUserPropertyDelayParamsV2;

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
  offsetDirection = DEFAULT_USER_PROPERTY_DELAY_OFFSET_DIRECTION,
  ...rest
}: GetUserPropertyDelayParams): Promise<number | null> {
  let events: UserWorkflowTrackEvent[] | undefined;
  if ("version" in rest) {
    events = await getTrackEventsById({
      workspaceId,
      eventIds: rest.eventIds,
    });
  } else {
    events = rest.events;
  }
  const assignments = await findAllUserPropertyAssignmentsById({
    workspaceId,
    userId,
    userPropertyIds: [userProperty],
    context: events?.flatMap((e) => e.properties ?? []),
  });

  const assignment = assignments[userProperty];
  if (!assignment) {
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
