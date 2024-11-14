import { add } from "date-fns";
import { getTimezoneOffset } from "date-fns-tz";
import { find as findTz } from "geo-tz";

import { LocalTimeDelayVariantFields, UserPropertyDelayVariant } from "./types";
import { findAllUserPropertyAssignments } from "./userProperties";

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
}: {
  workspaceId: string;
  userId: string;
  now: number;
} & Pick<
  UserPropertyDelayVariant,
  "userProperty" | "offsetSeconds" | "offsetDirection"
>): Promise<number | null> {
  const assignments = await findAllUserPropertyAssignments({
    workspaceId,
    userId,
    userPropertyIds: [userProperty],
  });
  const assignment = Object.values(assignments)[0];
  if (!assignment) {
    return null;
  }
  return null;
}
